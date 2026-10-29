import { expect, test } from "bun:test"
import { createRouter } from "./src/router"

function router(routes: [string, string][]) {
  const r = createRouter()
  routes.forEach(([pattern, name]) => r.add(pattern, name))
  return r
}

test("static, params and wildcard", () => {
  const r = router([
    ["/", "home"],
    ["/users", "users"],
    ["/users/:id", "user"],
    ["/users/:id/posts/:post", "post"],
    ["/files/*path", "file"],
  ])
  expect(r.match("/")).toEqual({ name: "home", params: {} })
  expect(r.match("/users")).toEqual({ name: "users", params: {} })
  expect(r.match("/users/42")).toEqual({ name: "user", params: { id: "42" } })
  expect(r.match("/users/42/posts/7")).toEqual({ name: "post", params: { id: "42", post: "7" } })
  expect(r.match("/files/a/b/c.txt")).toEqual({ name: "file", params: { path: "a/b/c.txt" } })
  expect(r.match("/files")).toBeUndefined()
  expect(r.match("/nope")).toBeUndefined()
  expect(r.match("/Users")).toBeUndefined()
  expect(r.match("/users/42/posts")).toBeUndefined()
})

test("precedence ignores registration order", () => {
  const r = router([
    ["/users/*rest", "rest"],
    ["/users/:id", "user"],
    ["/users/me", "me"],
  ])
  expect(r.match("/users/me")?.name).toBe("me")
  expect(r.match("/users/42")?.name).toBe("user")
  expect(r.match("/users/42/x")).toEqual({ name: "rest", params: { rest: "42/x" } })
})

test("backtracks when the preferred branch fails deeper", () => {
  const r = router([
    ["/users/me/settings", "settings"],
    ["/users/:id/posts", "posts"],
    ["/users/:id/:tab", "tab"],
    ["/users/*rest", "rest"],
  ])
  expect(r.match("/users/me/settings")?.name).toBe("settings")
  expect(r.match("/users/me/posts")).toEqual({ name: "posts", params: { id: "me" } })
  expect(r.match("/users/me/likes")).toEqual({ name: "tab", params: { id: "me", tab: "likes" } })
  expect(r.match("/users/me/a/b")).toEqual({ name: "rest", params: { rest: "me/a/b" } })
})

test("query strings and trailing slashes", () => {
  const r = router([
    ["/", "home"],
    ["/users/:id", "user"],
  ])
  expect(r.match("/users/42/")).toEqual({ name: "user", params: { id: "42" } })
  expect(r.match("/users/42?tab=posts&x=/y")).toEqual({ name: "user", params: { id: "42" } })
  expect(r.match("/users/42/?a=1")).toEqual({ name: "user", params: { id: "42" } })
  expect(r.match("/?q=1")).toEqual({ name: "home", params: {} })
  expect(r.match("/users//")).toBeUndefined()
  expect(r.match("/users/")).toBeUndefined()
})

test("decoding", () => {
  const r = router([
    ["/tags/café", "cafe"],
    ["/tags/:tag", "tag"],
    ["/files/*path", "file"],
  ])
  expect(r.match("/tags/a%2Fb")).toEqual({ name: "tag", params: { tag: "a/b" } })
  expect(r.match("/tags/hello%20world")).toEqual({ name: "tag", params: { tag: "hello world" } })
  expect(r.match("/tags/caf%C3%A9")).toEqual({ name: "cafe", params: {} })
  expect(r.match("/files/a%20b/c%2Fd")).toEqual({ name: "file", params: { path: "a b/c/d" } })
  expect(r.match("/tags/%E0%A4%A")).toBeUndefined()
  expect(r.match("/files/ok/%zz")).toBeUndefined()
})

test("add rejects duplicates and misplaced wildcards", () => {
  const r = createRouter()
  r.add("/a/:id", "a")
  expect(() => r.add("/a/:key", "b")).toThrow()
  expect(() => r.add("/a/:id", "c")).toThrow()
  r.add("/a/static", "d")
  r.add("/a/*rest", "e")
  expect(() => r.add("/a/*other", "f")).toThrow()
  expect(() => r.add("/x/*rest/y", "g")).toThrow()
  expect(r.match("/a/static")?.name).toBe("d")
})
