import { BrowserWindow } from 'electron'
import { logger } from '@infra/logging'
import { HardwareMonitor } from '@main/core/hardware/hardware-monitor'
import { HardwareStatus, HardwareAccessSummary } from '@shared/interfaces/common'
import { ProcessTracker } from '@main/core/network/process-tracker'
import type { ISystemMonitor } from '@main/core/system/base-system-monitor'

let hardwareMonitor: HardwareMonitor | null = null
let processTracker: ProcessTracker | null = null
let systemMonitor: ISystemMonitor | null = null
let mainWindow: BrowserWindow | null = null

function sendHardwareStatusToFrontend(status: HardwareStatus): void {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hardware-status', status)
    }
  } catch (error) {
    logger.debug('Failed to send hardware status to frontend:', error)
  }
}

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

export function setProcessTracker(tracker: ProcessTracker): void {
  if (!tracker) {
    throw new Error('ProcessTracker cannot be null')
  }
  processTracker = tracker
}

export function setSystemMonitor(monitor: ISystemMonitor | null): void {
  systemMonitor = monitor
  if (hardwareMonitor) {
    logger.debug('System monitor updated, but hardware monitor already initialized')
  }
}

export async function startHardwareMonitor(): Promise<void> {
  if (hardwareMonitor) {
    logger.warn('Hardware monitor already running')
    return
  }

  if (!processTracker) {
    throw new Error('Process tracker not initialized. Call setProcessTracker() first.')
  }

  try {
    hardwareMonitor = new HardwareMonitor(
      processTracker,
      sendHardwareStatusToFrontend,
      systemMonitor
    )
    await hardwareMonitor.start()
    logger.info('Hardware monitor started')
  } catch (error) {
    logger.error('Failed to start hardware monitor:', error)
    hardwareMonitor = null
    throw error
  }
}

export async function stopHardwareMonitor(): Promise<void> {
  if (!hardwareMonitor) {
    return
  }

  try {
    await hardwareMonitor.stop()
    hardwareMonitor = null
    logger.info('Hardware monitor stopped')
  } catch (error) {
    logger.error('Error stopping hardware monitor:', error)
    hardwareMonitor = null
  }
}

export async function getHardwareStatus(): Promise<HardwareStatus | null> {
  if (!hardwareMonitor) {
    return null
  }

  try {
    await hardwareMonitor.refreshStatus()
    return hardwareMonitor.getStatus()
  } catch (error) {
    logger.error('Failed to get hardware status:', error)
    return hardwareMonitor.getStatus()
  }
}

export function getHardwareSummary(): HardwareAccessSummary | null {
  if (!hardwareMonitor) {
    return null
  }

  try {
    return hardwareMonitor.getSummary()
  } catch (error) {
    logger.error('Failed to get hardware summary:', error)
    return null
  }
}

export function isHardwareMonitorRunning(): boolean {
  return hardwareMonitor?.isRunning() ?? false
}
