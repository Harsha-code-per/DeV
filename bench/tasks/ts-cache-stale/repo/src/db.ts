// Stand-in for a slow database. `calls` counts every read so callers can see cache hits.
export type User = { id: string; name: string; role: string; team: string }
export type Filter = { role?: string; team?: string }

export function createDb(seed: User[]) {
  const rows = new Map(seed.map((user) => [user.id, { ...user }]))
  const db = {
    calls: 0,
    getUser(id: string) {
      db.calls++
      const row = rows.get(id)
      return row && { ...row }
    },
    listUsers(filter: Filter) {
      db.calls++
      return [...rows.values()]
        .filter((u) => (filter.role === undefined || u.role === filter.role) && (filter.team === undefined || u.team === filter.team))
        .map((u) => ({ ...u }))
    },
    updateUser(id: string, patch: Partial<Omit<User, "id">>) {
      const row = rows.get(id)
      if (!row) throw new Error(`no user ${id}`)
      rows.set(id, { ...row, ...patch })
    },
    deleteUser(id: string) {
      rows.delete(id)
    },
  }
  return db
}

export type Db = ReturnType<typeof createDb>
