import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { logger } from '@infra/logging'
import * as schema from './schema'
import { getDatabasePaths } from './utils'

let db: BetterSQLite3Database<typeof schema> | null = null

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) {
    return db
  }

  const { dbPath } = getDatabasePaths()
  logger.info('Opening database', { dbPath })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  db = drizzle(sqlite, { schema })

  return db
}

export { schema }
export * from './services/settings.service'
