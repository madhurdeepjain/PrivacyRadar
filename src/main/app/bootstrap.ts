import { app, ipcMain } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { logger } from '@infra/logging'
import { runMigrations } from '@infra/db/migrate'
import { getDatabase, closeDatabase } from '@infra/db'
import { createMainWindow } from './window-manager'
import { GeoLocationService } from '../core/network/geo-location'
import fs from 'fs'
import path from 'path'
import {
  startAnalyzer,
  stopAnalyzer,
  setMainWindow,
  getInterfaceSelection,
  updateAnalyzerInterfaces,
  queryDatabase
} from './analyzer-runner'
import { ProcessTracker } from '@main/core/network/process-tracker'
import { registerAppLifecycleHandlers, registerProcessSignalHandlers } from './lifecycle'
import {
  createSystemMonitor,
  isSystemMonitoringSupported
} from '@core/system/system-monitor-factory'
import type { ISystemMonitor } from '@core/system/base-system-monitor'
import { setSharedProcessTracker } from './analyzer-runner'

let ipcHandlersRegistered = false
let systemMonitor: ISystemMonitor | null = null
let sharedProcessTracker: ProcessTracker | null = null

function validateSettingKey(key: unknown): key is string {
  return typeof key === 'string' && /^[a-zA-Z0-9_-]+$/.test(key) && key.length <= 100
}

export async function startApp(): Promise<void> {
  registerProcessSignalHandlers()

  await app.whenReady()

  electronApp.setAppUserModelId('com.privacyradar')
  registerAppLifecycleHandlers(createMainWindow)

  if (!ipcHandlersRegistered) {
    const userDataPath = app.getPath('userData')
    const filePath = path.join(userDataPath, 'values.json')
    const geoLocationService = new GeoLocationService()
    ipcMain.handle('network:getGeoLocation', async (_event, ip: unknown) => {
      if (typeof ip !== 'string' || ip.length === 0 || ip.length > 45) {
        logger.error('Invalid IP address parameter', { ip })
        throw new Error('Invalid IP address: must be a non-empty string with at most 45 characters')
      }
      if (!/^[0-9a-fA-F:.]+$/.test(ip)) {
        logger.error('Invalid IP address format', { ip })
        throw new Error('Invalid IP address format')
      }
      return await geoLocationService.lookup(ip)
    })
    ipcMain.handle('network:getPublicIP', async () => {
      return await geoLocationService.getPublicIP()
    })
    const getInterfaces = (): ReturnType<typeof getInterfaceSelection> => getInterfaceSelection()

    ipcMain.handle('network:getInterfaces', getInterfaces)
    ipcMain.handle('network:selectInterface', async (_event, interfaceNames: unknown) => {
      if (!Array.isArray(interfaceNames) || interfaceNames.length > 100) {
        logger.error('Invalid interface names parameter', { interfaceNames })
        throw new Error('Invalid interface names: must be an array with at most 100 elements')
      }
      await updateAnalyzerInterfaces(interfaceNames as string[])
      return getInterfaces()
    })
    ipcMain.handle('network:startCapture', async () => {
      await startAnalyzer()
      return getInterfaces()
    })
    ipcMain.handle('network:stopCapture', async () => {
      stopAnalyzer()
      return getInterfaces()
    })
    ipcMain.handle('network:queryDatabase', async (_event, options: unknown) => {
      if (!options || typeof options !== 'object' || !('table' in options)) {
        logger.error('Invalid query options parameter', { options })
        throw new Error('Invalid query options: must be an object with table property')
      }
      const validatedOptions = {
        table: options.table as 'global_snapshots' | 'application_snapshots' | 'process_snapshots',
        limit: 'limit' in options ? (options.limit as number) : undefined,
        offset: 'offset' in options ? (options.offset as number) : undefined
      }
      return queryDatabase(validatedOptions)
    })
    ipcMain.handle('set-value', async (_event, key: string, value: string) => {
      if (!validateSettingKey(key)) {
        logger.error('Invalid setting key', { key })
        throw new Error('Invalid setting key')
      }

      if (typeof value !== 'string' || value.length > 10000) {
        logger.error('Invalid setting value', { key, valueLength: value?.length })
        throw new Error('Invalid setting value')
      }

      try {
        let values: Record<string, string> = {}
        if (fs.existsSync(filePath)) {
          const data = await fs.promises.readFile(filePath, 'utf8')
          try {
            const parsed = JSON.parse(data)
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              values = parsed
            } else {
              logger.warn('Corrupted settings file, resetting', { filePath })
            }
          } catch (parseError) {
            logger.warn('Failed to parse settings file, resetting', { filePath, error: parseError })
          }
        }

        values[key] = value

        const dirPath = path.dirname(filePath)
        await fs.promises.mkdir(dirPath, { recursive: true })

        const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`
        await fs.promises.writeFile(tmpPath, JSON.stringify(values), 'utf8')
        await fs.promises.rename(tmpPath, filePath)
      } catch (error) {
        logger.error('Error saving setting', { key, error })
        throw error
      }
    })

    ipcMain.handle('get-value', async (_event, key: string) => {
      if (!validateSettingKey(key)) {
        logger.error('Invalid setting key', { key })
        return null
      }

      try {
        if (!fs.existsSync(filePath)) {
          return null
        }
        const data = await fs.promises.readFile(filePath, 'utf8')
        const values = JSON.parse(data)

        if (typeof values !== 'object' || values === null || Array.isArray(values)) {
          logger.warn('Corrupted settings file', { filePath })
          return null
        }

        return values[key] ?? null
      } catch (err) {
        logger.error('Error loading settings', { key, error: err })
        return null
      }
    })

    ipcMain.handle('system:start', () => {
      logger.info('System monitor start requested by user')
      systemMonitor?.start()
      return { success: true }
    })
    ipcMain.handle('system:stop', () => {
      logger.info('System monitor stop requested by user')
      systemMonitor?.stop()
      return { success: true }
    })
    ipcMain.handle('system:get-active-sessions', () => {
      return systemMonitor?.getActiveSessions() || []
    })
    ipcMain.handle('system:is-supported', () => {
      return isSystemMonitoringSupported()
    })

    ipcHandlersRegistered = true
  }

  try {
    logger.info('Running database migrations')
    runMigrations()
    logger.info('Migrations completed successfully')
  } catch (error) {
    logger.error('Failed to run migrations', error)
  }

  try {
    getDatabase()
    logger.info('Database initialized successfully')
  } catch (error) {
    logger.error('Failed to initialize database', error)
  }

  const mainWindow = createMainWindow()
  setMainWindow(mainWindow)

  if (process.platform === 'linux') {
    sharedProcessTracker = new ProcessTracker()
    setSharedProcessTracker(sharedProcessTracker)
    logger.info('Created shared ProcessTracker for Linux')
  }

  systemMonitor = createSystemMonitor(mainWindow, sharedProcessTracker || undefined)

  if (!isSystemMonitoringSupported()) {
    logger.warn(
      'System monitoring is not fully supported on this platform. Some features may be limited.'
    )
  } else {
    try {
      await systemMonitor.start()
      logger.info('System monitor started')
    } catch (error) {
      logger.warn('Failed to start system monitor', error)
    }
  }
}

export function shutdownApp(): void {
  stopAnalyzer()
  systemMonitor?.stop()
  systemMonitor = null
  closeDatabase()
  app.quit()
}
