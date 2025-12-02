import { HARDWARE_POLL_INTERVAL_MS } from '@config/constants'
import { logger } from '@infra/logging'
import { HardwareStatus, HardwareAccessSummary } from '@shared/interfaces/common'
import { HardwareTracker } from './hardware-tracker'
import { ProcessTracker } from '../network/process-tracker'
import type { ISystemMonitor } from '../system/base-system-monitor'

export class HardwareMonitor {
  private readonly tracker: HardwareTracker
  private pollingTimer: NodeJS.Timeout | null = null
  private currentStatus: HardwareStatus | null = null
  private readonly onStatusUpdate: (status: HardwareStatus) => void
  private isStopping: boolean = false
  private refreshInProgress: boolean = false

  constructor(
    processTracker: ProcessTracker,
    onStatusUpdate: (status: HardwareStatus) => void,
    systemMonitor: ISystemMonitor | null = null
  ) {
    this.tracker = new HardwareTracker(processTracker, systemMonitor)
    this.onStatusUpdate = onStatusUpdate
  }

  async start(): Promise<void> {
    if (this.pollingTimer) {
      logger.warn('Hardware monitor already running')
      return
    }

    this.isStopping = false

    try {
      await this.refreshStatus()
    } catch (error) {
      logger.error('Failed initial hardware status check:', error)
    }

    this.pollingTimer = setInterval(() => {
      if (!this.isStopping) {
        void this.refreshStatus()
      }
    }, HARDWARE_POLL_INTERVAL_MS)

    logger.info('Hardware monitor started')
  }

  stop(): void {
    if (!this.pollingTimer) {
      return
    }

    this.isStopping = true

    clearInterval(this.pollingTimer)
    this.pollingTimer = null

    const maxWait = 1000
    const startWait = Date.now()
    while (this.refreshInProgress && Date.now() - startWait < maxWait) {
      // Wait for refresh to complete
    }

    this.currentStatus = null
    logger.info('Hardware monitor stopped')
  }

  async refreshStatus(): Promise<void> {
    if (this.isStopping || this.refreshInProgress) {
      return
    }

    this.refreshInProgress = true
    try {
      const status = await this.tracker.getHardwareStatus()

      if (!this.isStopping) {
        this.currentStatus = status
        this.onStatusUpdate(status)
      }
    } catch (error) {
      logger.error('Failed to refresh hardware status:', error)
    } finally {
      this.refreshInProgress = false
    }
  }

  getStatus(): HardwareStatus | null {
    return this.currentStatus
  }

  getSummary(): HardwareAccessSummary | null {
    if (!this.currentStatus) {
      return null
    }

    const allAccesses = [
      ...this.currentStatus.camera,
      ...this.currentStatus.microphone,
      ...this.currentStatus.screenCapture,
      ...this.currentStatus.gpu,
      ...this.currentStatus.storage
    ]

    const activeDevices = new Set<string>()
    const activeApps = new Set<string>()

    allAccesses.forEach((access) => {
      activeDevices.add(access.device)
      if (access.procName) {
        activeApps.add(access.procName)
      }
    })

    return {
      status: this.currentStatus,
      activeDevices: Array.from(activeDevices),
      activeApps: Array.from(activeApps),
      totalActiveAccess: allAccesses.length
    }
  }

  isRunning(): boolean {
    return this.pollingTimer !== null && !this.isStopping
  }
}
