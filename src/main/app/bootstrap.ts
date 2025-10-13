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
  switchAnalyzerInterface
} from './analyzer-runner'
import { registerAppLifecycleHandlers, registerProcessSignalHandlers } from './lifecycle'

let ipcHandlersRegistered = false

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

  if (!ipcHandlersRegistered) {
    ipcMain.handle('network:getInterfaces', async () => getInterfaceSelection())
    ipcMain.handle('network:selectInterface', async (_event, interfaceName: string) => {
      await switchAnalyzerInterface(interfaceName)
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
    ipcHandlersRegistered = true
  }
}

export function shutdownApp(): void {
  stopAnalyzer()
  app.quit()
}
