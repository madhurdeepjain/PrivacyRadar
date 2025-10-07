import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { logger } from '@infra/logging'
import { getDatabasePaths } from './utils'

export function runMigrations(): void {
  const { dbPath, migrationsPath } = getDatabasePaths()

  logger.info('Running migrations', { dbPath, migrationsPath })

  try {
    const sqlite = new Database(dbPath)
    const db = drizzle(sqlite)

    migrate(db, { migrationsFolder: migrationsPath })

    sqlite.close()
  } catch (error) {
    logger.error('Migration failed', error)
    throw error
  }
}
