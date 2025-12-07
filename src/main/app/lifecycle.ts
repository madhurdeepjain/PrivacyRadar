import { app, BrowserWindow } from 'electron'
import { logger } from '@infra/logging'
import { stopAnalyzer } from './analyzer-runner'

export function registerAppLifecycleHandlers(createWindow: () => BrowserWindow): void {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', () => {
    stopAnalyzer()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    // Shutdown logger BEFORE cleanup code runs to prevent "worker is ending" errors
    // This ensures no cleanup code tries to log after the worker thread is terminated
    logger.shutdown()
    stopAnalyzer()
  })
}

export function registerProcessSignalHandlers(): void {
  const handleSignal = (signal: NodeJS.Signals): void => {
    logger.info(`Received ${signal}, shutting down`)
    // Shutdown logger BEFORE cleanup to prevent "worker is ending" errors
    logger.shutdown()
    stopAnalyzer()
    app.quit()
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)
}
