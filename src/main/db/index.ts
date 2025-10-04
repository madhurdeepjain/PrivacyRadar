import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import * as schema from './schema'
import { getDatabasePaths } from './utils'

let db: BetterSQLite3Database<typeof schema> | null = null

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) {
    return db
  }

  const { dbPath } = getDatabasePaths()

  console.log(`Database path: ${dbPath}`)

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL') // Enable WAL mode for better concurrency

  // Initialize Drizzle ORM
  db = drizzle(sqlite, { schema })

  return db
}

export { schema }

// Re-export services for easy imports
export * from './services/settings.service'
