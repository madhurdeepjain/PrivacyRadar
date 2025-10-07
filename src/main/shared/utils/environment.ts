import { app } from 'electron'

/**
 * Check if the application is running in development mode.
 * This is determined by whether the app is packaged or not.
 *
 * @returns true if running in development, false if running in production
 */
export function isDevelopment(): boolean {
  return !app.isPackaged
}
