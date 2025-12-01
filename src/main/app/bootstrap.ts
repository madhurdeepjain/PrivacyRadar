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
import {
  startHardwareMonitor,
  stopHardwareMonitor,
  setMainWindow as setHardwareMainWindow,
  setProcessTracker,
  setSystemMonitor,
  getHardwareStatus,
  getHardwareSummary
} from './hardware-runner'
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
    ipcMain.handle('hardware:getStatus', async () => getHardwareStatus())
    ipcMain.handle('hardware:getSummary', async () => getHardwareSummary())
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
  setHardwareMainWindow(mainWindow)

  // Initialize process tracker for hardware monitoring
  const processTracker = new ProcessTracker()
  setProcessTracker(processTracker)
  await processTracker.startPolling()

  // Initialize system monitoring if supported (needed for unified hardware monitoring)
  if (isSystemMonitoringSupported()) {
    try {
      // Pass processTracker for Linux system monitor
      systemMonitor = createSystemMonitor(mainWindow, processTracker)
      systemMonitor.start()
      logger.info('System monitor started')
      // Pass system monitor to hardware runner for unified monitoring
      setSystemMonitor(systemMonitor)
    } catch (error) {
      logger.warn('Failed to start system monitor', error)
    }
  }

  // Start hardware monitoring (unified across platforms)
  // On macOS/Windows: uses system monitoring data
  // On Linux: uses direct device checking
  try {
    await startHardwareMonitor()
  } catch (error) {
    logger.warn('Failed to start hardware monitor', error)
  }
}

export function shutdownApp(): void {
  stopAnalyzer()
  stopHardwareMonitor()
  if (systemMonitor) {
    systemMonitor.stop()
    systemMonitor = null
  }
  app.quit()
}
