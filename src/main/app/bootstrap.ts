import { app, ipcMain } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { logger } from '@infra/logging'
import { runMigrations } from '@infra/db/migrate'
import { getDatabase } from '@infra/db'
import { createMainWindow } from './window-manager'
import { startAnalyzer, stopAnalyzer } from './analyzer-runner'
import { registerAppLifecycleHandlers, registerProcessSignalHandlers } from './lifecycle'

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

  createMainWindow()

  ipcMain.on('ping', () => logger.debug('pong'))

  try {
    await startAnalyzer()
  } catch (error) {
    logger.error('Failed to start network analyzer', error)
  }
}

export function shutdownApp(): void {
  stopAnalyzer()
  app.quit()
}
