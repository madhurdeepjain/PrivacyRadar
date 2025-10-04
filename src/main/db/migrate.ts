import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import Database from 'better-sqlite3'
import { getDatabasePaths } from './utils'

export function runMigrations(): void {
  const { dbPath, migrationsPath } = getDatabasePaths()

  console.log(`Running migrations from: ${migrationsPath}`)
  console.log(`Target database: ${dbPath}`)

  try {
    const sqlite = new Database(dbPath)
    const db = drizzle(sqlite)

    migrate(db, { migrationsFolder: migrationsPath })

    console.log('Migrations completed successfully')

    sqlite.close()
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}
