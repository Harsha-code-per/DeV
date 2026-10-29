import { expect, test } from "bun:test"
import { createDb, type User } from "./src/db"
import { createUserService } from "./src/users"

const seed: User[] = [
  { id: "u1", name: "Ada", role: "dev", team: "core" },
  { id: "u2", name: "Bob", role: "ops", team: "dev" },
  { id: "u3", name: "Cy", role: "dev", team: "web" },
]

function setup(ttlMs = 1000) {
  const clock = { t: 0 }
  const db = createDb(seed)
  const users = createUserService(db, { ttlMs, now: () => clock.t })
  return { clock, db, users }
}
const names = (list: User[]) => list.map((u) => u.name)

test("repeated reads within the TTL hit the cache", () => {
  const { db, users } = setup()
  expect(users.getUser("u1")?.name).toBe("Ada")
  expect(users.getUser("u1")?.name).toBe("Ada")
  expect(names(users.listUsers({ role: "dev" }))).toEqual(["Ada", "Cy"])
  expect(names(users.listUsers({ role: "dev" }))).toEqual(["Ada", "Cy"])
  expect(names(users.listUsers())).toEqual(["Ada", "Bob", "Cy"])
  expect(names(users.listUsers({}))).toEqual(["Ada", "Bob", "Cy"])
  expect(db.calls).toBe(3)
})

test("entries expire exactly at t + ttl and reads do not extend them", () => {
  const { clock, db, users } = setup(1000)
  users.getUser("u1")
  clock.t = 600
  users.getUser("u1")
  clock.t = 999
  users.getUser("u1")
  expect(db.calls).toBe(1)
  clock.t = 1000
  users.getUser("u1")
  expect(db.calls).toBe(2)
  clock.t = 1999
  users.getUser("u1")
  expect(db.calls).toBe(2)
  clock.t = 2000
  users.getUser("u1")
  expect(db.calls).toBe(3)
})

test("updates show up in getUser and in every cached list", () => {
  const { db, users } = setup()
  users.getUser("u1")
  users.listUsers()
  users.listUsers({ role: "dev" })
  users.listUsers({ team: "core" })
  users.updateUser("u1", { name: "Ada L." })
  expect(users.getUser("u1")?.name).toBe("Ada L.")
  expect(names(users.listUsers())).toEqual(["Ada L.", "Bob", "Cy"])
  expect(names(users.listUsers({ role: "dev" }))).toEqual(["Ada L.", "Cy"])
  users.updateUser("u3", { role: "ops" })
  expect(names(users.listUsers({ role: "dev" }))).toEqual(["Ada L."])
  expect(names(users.listUsers({ role: "ops" }))).toEqual(["Bob", "Cy"])
  expect(db.calls).toBeGreaterThan(4)
})

test("deletes show up everywhere", () => {
  const { users } = setup()
  expect(users.getUser("u2")?.name).toBe("Bob")
  expect(names(users.listUsers())).toEqual(["Ada", "Bob", "Cy"])
  users.deleteUser("u2")
  expect(users.getUser("u2")).toBeUndefined()
  expect(names(users.listUsers())).toEqual(["Ada", "Cy"])
  expect(names(users.listUsers({ role: "ops" }))).toEqual([])
})

test("different filters never share an entry", () => {
  const { db, users } = setup()
  expect(names(users.listUsers({ role: "dev" }))).toEqual(["Ada", "Cy"])
  expect(names(users.listUsers({ team: "dev" }))).toEqual(["Bob"])
  expect(names(users.listUsers({ role: "dev", team: "web" }))).toEqual(["Cy"])
  expect(names(users.listUsers({ team: "web", role: "dev" }))).toEqual(["Cy"])
  const before = db.calls
  expect(names(users.listUsers({ role: "dev", team: undefined }))).toEqual(["Ada", "Cy"])
  expect(db.calls).toBe(before)
})

test("callers get copies", () => {
  const { users } = setup()
  const user = users.getUser("u1")!
  user.name = "HACKED"
  expect(users.getUser("u1")?.name).toBe("Ada")
  const list = users.listUsers()
  list[0].name = "HACKED"
  list.pop()
  expect(names(users.listUsers())).toEqual(["Ada", "Bob", "Cy"])
})
