import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'path'
import * as schema from '../../../src/main/infrastructure/db/schema'

const dbInstances = new WeakMap<BetterSQLite3Database<typeof schema>, Database>()

export function createTestDatabase(
  dbPath: string,
  migrationsPath?: string
): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  const db = drizzle(sqlite, { schema })

  dbInstances.set(db, sqlite)

  if (migrationsPath) {
    migrate(db, { migrationsFolder: migrationsPath })
  }

  return db
}

export function closeDatabase(db: BetterSQLite3Database<typeof schema>): void {
  const sqlite = dbInstances.get(db)
  if (sqlite) {
    sqlite.close()
    dbInstances.delete(db)
  }
}

export function getMigrationsPath(): string {
  return join(process.cwd(), 'drizzle')
}
