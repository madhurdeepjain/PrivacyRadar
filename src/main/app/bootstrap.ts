import { app, ipcMain } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { logger } from '@infra/logging'
import { runMigrations } from '@infra/db/migrate'
import { getDatabase } from '@infra/db'
import { createMainWindow } from './window-manager'
import {
  startAnalyzer,
  stopAnalyzer,
  setMainWindow,
  getInterfaceSelection,
  updateAnalyzerInterfaces
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
