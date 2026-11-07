// One DeV-like process for database-processes.test.ts: transactions that read and then write.
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { Database } from "../../src/database/database"

const program = Effect.gen(function* () {
  const database = yield* Database.Service
  yield* database.db.run(sql`CREATE TABLE IF NOT EXISTS hit (n INTEGER)`)
  for (let i = 0; i < 40; i++) {
    yield* database.db.transaction((tx) =>
      Effect.gen(function* () {
        const rows = yield* tx.all<{ c: number }>(sql`SELECT count(*) AS c FROM hit`)
        yield* Effect.promise(() => Bun.sleep(1))
        yield* tx.run(sql`INSERT INTO hit (n) VALUES (${rows[0]!.c})`)
      }),
    )
  }
}).pipe(Effect.provide(Database.layerFromPath(process.argv[2]!)))

await Effect.runPromise(program)
