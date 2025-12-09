import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { logger } from '@infra/logging'
import * as schema from './schema'
import { getDatabasePaths } from './utils'

let db: BetterSQLite3Database<typeof schema> | null = null
let sqliteClient: Database.Database | null = null

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) {
    return db
  }

  const { dbPath } = getDatabasePaths()
  logger.info('Opening database', { dbPath })

  sqliteClient = new Database(dbPath)
  sqliteClient.pragma('journal_mode = WAL')

  db = drizzle(sqliteClient, { schema })

  return db
}

export function closeDatabase(): void {
  if (sqliteClient) {
    try {
      sqliteClient.close()
      logger.info('Database connection closed')
    } catch (error) {
      logger.error('Error closing database', error)
    }
    sqliteClient = null
    db = null
  }
}

export { schema }
