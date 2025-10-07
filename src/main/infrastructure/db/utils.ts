import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { DEV_DATA_PATH } from '@main/config/constants'

export interface DatabasePaths {
  dbPath: string
  migrationsPath: string
}

export function getDatabasePaths(): DatabasePaths {
  const isDev = !app.isPackaged

  if (isDev) {
    const appPath = app.getAppPath()

    if (!existsSync(DEV_DATA_PATH)) {
      mkdirSync(DEV_DATA_PATH, { recursive: true })
    }

    return {
      dbPath: join(DEV_DATA_PATH, 'dev.db'),
      migrationsPath: join(appPath, 'drizzle')
    }
  }

  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  return {
    dbPath: join(dbDir, 'app.db'),
    migrationsPath: join(process.resourcesPath, 'drizzle')
  }
}
