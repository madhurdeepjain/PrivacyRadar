import { app, BrowserWindow } from 'electron'
import { logger } from '@infra/logging'
import { stopAnalyzer } from './analyzer-runner'
import { closeDatabase } from '@infra/db'

export function registerAppLifecycleHandlers(createWindow: () => BrowserWindow): void {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', () => {
    stopAnalyzer()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    stopAnalyzer()
    try {
      closeDatabase()
    } catch (error) {
      logger.error('Error closing database during shutdown', error)
    }
  })
}

export function registerProcessSignalHandlers(): void {
  const handleSignal = (signal: NodeJS.Signals): void => {
    logger.info(`Received ${signal}, shutting down`)
    stopAnalyzer()
    closeDatabase()
    app.quit()
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)
}
