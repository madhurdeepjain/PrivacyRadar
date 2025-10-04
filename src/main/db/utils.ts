import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

export interface DatabasePaths {
  dbPath: string
  migrationsPath: string
}

/**
 * Get database and migrations paths based on the current environment
 * @returns Object containing database path and migrations path
 */
export function getDatabasePaths(): DatabasePaths {
  const isDev = !app.isPackaged

  let dbPath: string
  let migrationsPath: string

  if (isDev) {
    // Development: use app directory (will be gitignored)
    const appPath = app.getAppPath()
    const dbDir = join(appPath, 'dev-data')

    // Create directory if it doesn't exist
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    dbPath = join(dbDir, 'dev.db')
    migrationsPath = join(appPath, 'drizzle')
  } else {
    // Production: use userData directory
    const userDataPath = app.getPath('userData')
    const dbDir = join(userDataPath, 'data')

    // Create directory if it doesn't exist
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    dbPath = join(dbDir, 'app.db')
    // In production, migrations are bundled with the app
    migrationsPath = join(process.resourcesPath, 'drizzle')
  }

  return { dbPath, migrationsPath }
}
