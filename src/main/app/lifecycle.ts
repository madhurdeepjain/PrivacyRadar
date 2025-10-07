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

  app.on('will-quit', () => stopAnalyzer())
}

export function registerProcessSignalHandlers(): void {
  const handleSignal = (signal: NodeJS.Signals): void => {
    logger.info(`Received ${signal}, shutting down`)
    stopAnalyzer()
    app.quit()
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)
}
