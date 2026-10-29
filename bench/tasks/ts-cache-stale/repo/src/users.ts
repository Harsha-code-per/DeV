import { createCache } from "./cache"
import type { Db, Filter, User } from "./db"

export function createUserService(db: Db, options: { ttlMs: number; now: () => number }) {
  const cache = createCache<User | User[] | undefined>(options.ttlMs, options.now)
  return {
    getUser(id: string) {
      const key = `user:${id}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit as User
      const user = db.getUser(id)
      cache.set(key, user)
      return user
    },
    listUsers(filter: Filter = {}) {
      const key = `list:${Object.values(filter).join(",")}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit as User[]
      const users = db.listUsers(filter)
      cache.set(key, users)
      return users
    },
    updateUser(id: string, patch: Partial<Omit<User, "id">>) {
      db.updateUser(id, patch)
      cache.delete(`user:${id}`)
    },
    deleteUser(id: string) {
      db.deleteUser(id)
      cache.delete(`user:${id}`)
    },
  }
}
