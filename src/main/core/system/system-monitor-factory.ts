import { BrowserWindow } from 'electron'
import { logger } from '@infra/logging'
import type { ISystemMonitor } from './base-system-monitor'
import { TCCMonitor } from './darwin-tcc-monitor'
import { WindowsSystemMonitor } from './windows-system-monitor'
import { LinuxSystemMonitor } from './linux-system-monitor'
import type { ProcessTracker } from '../network/process-tracker'

/**
 * System Monitor Factory
 *
 * Creates the appropriate system monitor based on the current platform.
 * Returns a platform-specific implementation that monitors system permission events:
 *
 * - macOS (Darwin): TCC Monitor - monitors system TCC logs
 * - Windows: Windows System Monitor - monitors Event Logs (stub for now)
 * - Linux: Linux System Monitor - monitors hardware device access
 *
 * @param window - The main BrowserWindow for sending events to renderer
 * @param processTracker - Optional shared ProcessTracker instance (for Linux)
 * @returns Platform-specific system monitor implementation
 */
export function createSystemMonitor(
  window: BrowserWindow,
  processTracker?: ProcessTracker
): ISystemMonitor {
  const platform = process.platform

  logger.info(`Creating system monitor for platform: ${platform}`)

  switch (platform) {
    case 'darwin':
      logger.info('Using macOS TCC Monitor')
      return new TCCMonitor(window)

    case 'win32':
      logger.info('Using Windows System Monitor (stub implementation)')
      return new WindowsSystemMonitor(window)

    case 'linux':
      logger.info('Using Linux System Monitor')
      return new LinuxSystemMonitor(window, processTracker)

    default:
      logger.warn(`Unsupported platform: ${platform}. Using macOS TCC Monitor as fallback.`)
      return new TCCMonitor(window)
  }
}

/**
 * Check if system monitoring is supported on the current platform
 */
export function isSystemMonitoringSupported(): boolean {
  return process.platform === 'darwin' || process.platform === 'linux'
}
