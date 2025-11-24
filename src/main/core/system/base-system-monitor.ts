import { BrowserWindow } from 'electron'
import type { TCCEvent } from '@shared/interfaces/common'

/**
 * Base interface for platform-specific system monitors
 * Each platform (macOS/Windows/Linux) will implement this interface
 * Monitors OS-level permission requests and resource access
 */
export interface ISystemMonitor {
  /**
   * Start monitoring system permission events
   */
  start(): void

  /**
   * Stop monitoring system permission events
   */
  stop(): void

  /**
   * Get currently active system permission sessions
   * @returns Array of active permission events
   */
  getActiveSessions(): TCCEvent[]

  /**
   * Check if monitor is currently running
   */
  isRunning(): boolean
}

/**
 * Abstract base class for system monitors
 * Provides common functionality for all platforms
 */
export abstract class BaseSystemMonitor implements ISystemMonitor {
  protected mainWindow: BrowserWindow | null = null
  protected isActive: boolean = false

  constructor(window: BrowserWindow) {
    this.mainWindow = window
  }

  abstract start(): void
  abstract stop(): void
  abstract getActiveSessions(): TCCEvent[]

  isRunning(): boolean {
    return this.isActive
  }

  /**
   * Send system permission event to renderer process
   */
  protected sendEvent(event: TCCEvent): void {
    this.mainWindow?.webContents.send('system-event', event)
  }

  /**
   * Send session update to renderer process
   */
  protected sendSessionUpdate(event: TCCEvent): void {
    this.mainWindow?.webContents.send('system-session-update', event)
  }
}
