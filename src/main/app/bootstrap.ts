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
import { registerAppLifecycleHandlers, registerProcessSignalHandlers } from './lifecycle'
import {
  createSystemMonitor,
  isSystemMonitoringSupported
} from '@core/system/system-monitor-factory'
import type { ISystemMonitor } from '@core/system/base-system-monitor'

let ipcHandlersRegistered = false
let systemMonitor: ISystemMonitor | null = null

export async function startApp(): Promise<void> {
  registerProcessSignalHandlers()

  await app.whenReady()

  electronApp.setAppUserModelId('com.privacyradar')
  registerAppLifecycleHandlers(createMainWindow)

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

  // Initialize System Monitor (platform-specific)
  systemMonitor = createSystemMonitor(mainWindow)

  if (!isSystemMonitoringSupported()) {
    logger.warn(
      'System monitoring is not fully supported on this platform. Some features may be limited.'
    )
  }

  if (!ipcHandlersRegistered) {
    const userDataPath = app.getPath('userData')
    const filePath = path.join(userDataPath, 'values.json')
    const geoLocationService = new GeoLocationService()
    ipcMain.handle('network:getGeoLocation', async (_event, ip: string) => {
      return await geoLocationService.lookup(ip)
    })
    ipcMain.handle('network:getPublicIP', async () => {
      return await geoLocationService.getPublicIP()
    })
    ipcMain.handle('network:getInterfaces', async () => getInterfaceSelection())
    ipcMain.handle('network:selectInterface', async (_event, interfaceNames: string[]) => {
      await updateAnalyzerInterfaces(interfaceNames)
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
    ipcMain.handle('network:queryDatabase', async (_event, sql: string) => {
      return queryDatabase(sql)
    })
    ipcMain.handle('set-value', (_event, key: string, value: string) => {
      if (fs.existsSync(filePath)) {
        fs.readFile(filePath, 'utf8', (err, data) => {
          if (err) console.error('Error loading settings:', err)
          else {
            const values = JSON.parse(data)
            values[key] = value
            fs.writeFile(filePath, JSON.stringify(values), (err) => {
              if (err) console.error('Error saving settings:', err)
            })
          }
        })
      } else {
        const values = {}
        values[key] = value
        fs.writeFile(filePath, JSON.stringify(values), (err) => {
          if (err) console.error('Error saving settings:', err)
        })
      }
    })

    ipcMain.handle('get-value', async (_event, key: string) => {
      try {
        if (!fs.existsSync(filePath)) {
          return null
        }
        const data = await fs.promises.readFile(filePath, 'utf8')
        const values = JSON.parse(data)
        return values[key]
      } catch (err) {
        console.error('Error loading settings:', err)
        return null
      }
    })

    // System Monitor handlers
    ipcMain.handle('system:start', () => {
      systemMonitor?.start()
      return { success: true }
    })
    ipcMain.handle('system:stop', () => {
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
}

export function shutdownApp(): void {
  stopAnalyzer()
  systemMonitor?.stop()
  app.quit()
}
