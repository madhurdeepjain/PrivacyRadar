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

let ipcHandlersRegistered = false
let systemMonitor: ISystemMonitor | null = null

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

  // Initialize ProcessTracker for Linux system monitor (if needed)
  let processTracker: ProcessTracker | undefined
  if (process.platform === 'linux') {
    processTracker = new ProcessTracker()
    try {
      await processTracker.startPolling()
      logger.info('Process tracker started for Linux system monitor')
    } catch (error) {
      logger.error('Failed to start process tracker:', error)
      // Continue without process tracker - Linux monitor will log an error
    }
  }

  // Initialize System Monitor (platform-specific)
  // Pass processTracker for Linux system monitor
  systemMonitor = createSystemMonitor(mainWindow, processTracker)

  if (!isSystemMonitoringSupported()) {
    logger.warn(
      'System monitoring is not fully supported on this platform. Some features may be limited.'
    )
  } else {
    try {
      systemMonitor.start()
      logger.info('System monitor started')
    } catch (error) {
      logger.warn('Failed to start system monitor', error)
    }
  }
}

export function shutdownApp(): void {
  // Shutdown logger BEFORE cleanup code runs to prevent "worker is ending" errors
  logger.shutdown()
  stopAnalyzer()
  systemMonitor?.stop()
  systemMonitor = null
  app.quit()
}
