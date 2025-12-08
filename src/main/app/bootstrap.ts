import { app, ipcMain } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { logger } from '@infra/logging'
import { runMigrations } from '@infra/db/migrate'
import { getDatabase } from '@infra/db'
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

export async function startApp(): Promise<void> {
  registerProcessSignalHandlers()

  await app.whenReady()

  electronApp.setAppUserModelId('com.privacyradar')
  registerAppLifecycleHandlers(createMainWindow)

  // Register IPC handlers BEFORE creating the window to avoid race conditions
  // The renderer may call these handlers immediately on mount
  if (!ipcHandlersRegistered) {
    const userDataPath = app.getPath('userData')
    const filePath = path.join(userDataPath, 'values.json')
    const geoLocationService = new GeoLocationService()
    ipcMain.handle('network:getGeoLocation', async (_event, ip: unknown) => {
      if (typeof ip !== 'string' || ip.length === 0 || ip.length > 45) {
        // IPv6 addresses can be up to 45 characters
        logger.error('Invalid IP address parameter', { ip })
        throw new Error('Invalid IP address: must be a non-empty string with at most 45 characters')
      }
      // Basic IP format validation (allows IPv4 and IPv6)
      if (!/^[0-9a-fA-F:.]+$/.test(ip)) {
        logger.error('Invalid IP address format', { ip })
        throw new Error('Invalid IP address format')
      }
      return await geoLocationService.lookup(ip)
    })
    ipcMain.handle('network:getPublicIP', async () => {
      return await geoLocationService.getPublicIP()
    })
    ipcMain.handle('network:getInterfaces', async () => getInterfaceSelection())
    ipcMain.handle('network:selectInterface', async (_event, interfaceNames: unknown) => {
      if (!Array.isArray(interfaceNames) || interfaceNames.length > 100) {
        logger.error('Invalid interface names parameter', { interfaceNames })
        throw new Error('Invalid interface names: must be an array with at most 100 elements')
      }
      // Additional validation happens in updateAnalyzerInterfaces
      await updateAnalyzerInterfaces(interfaceNames as string[])
      return getInterfaceSelection()
    })
    ipcMain.handle('network:startCapture', async () => {
      await startAnalyzer()
      return getInterfaceSelection()
    })
    ipcMain.handle('network:stopCapture', async () => {
      stopAnalyzer()
      return getInterfaceSelection()
    })
    ipcMain.handle('network:queryDatabase', async (_event, sql: unknown) => {
      if (typeof sql !== 'string') {
        logger.error('Invalid SQL query parameter', { sql })
        throw new Error('Invalid SQL query: must be a string')
      }
      // Additional validation happens in queryDatabase function
      return queryDatabase(sql)
    })
    ipcMain.handle('set-value', async (_event, key: string, value: string) => {
      // Validate key to prevent path traversal
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(key) || key.length > 100) {
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
        
        // Ensure directory exists before writing (idempotent - safe for concurrent calls)
        const dirPath = path.dirname(filePath)
        await fs.promises.mkdir(dirPath, { recursive: true })
        
        // Atomic write: use unique temp filename to avoid conflicts in concurrent writes
        // Use timestamp + random to ensure uniqueness
        const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`
        await fs.promises.writeFile(tmpPath, JSON.stringify(values), 'utf8')
        await fs.promises.rename(tmpPath, filePath)
      } catch (error) {
        logger.error('Error saving setting', { key, error })
        throw error
      }
    })

    ipcMain.handle('get-value', async (_event, key: string) => {
      // Validate key to prevent path traversal
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(key) || key.length > 100) {
        logger.error('Invalid setting key', { key })
        return null
      }

      try {
        if (!fs.existsSync(filePath)) {
          return null
        }
        const data = await fs.promises.readFile(filePath, 'utf8')
        const values = JSON.parse(data)
        
        // Validate parsed structure
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

    // System Monitor handlers
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

  // Create shared ProcessTracker for Linux (used by both NetworkAnalyzer and LinuxSystemMonitor)
  // This avoids duplicate polling and process caching
  if (process.platform === 'linux') {
    sharedProcessTracker = new ProcessTracker()
    setSharedProcessTracker(sharedProcessTracker)
    logger.info('Created shared ProcessTracker for Linux')
  }

  // Initialize System Monitor (platform-specific)
  // Pass shared ProcessTracker to Linux monitor
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
  app.quit()
}
