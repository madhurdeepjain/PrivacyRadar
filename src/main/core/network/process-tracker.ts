import psList, { ProcessDescriptor } from 'ps-list'
import { PROCESS_POLL_INTERVAL_MS } from '@config/constants'
import { logger } from '@infra/logging'
import { ProcDetails } from '@shared/interfaces/common'

/**
 * Maintains a cache of running processes sourced from ps-list.
 */
export class ProcessTracker {
  private readonly procCache = new Map<number, ProcDetails>()
  private pollingTimer: NodeJS.Timeout | null = null

  async refreshProcesses(): Promise<void> {
    try {
      type PsListFn = () => Promise<ProcessDescriptor[]>

      let psListFunction: PsListFn | undefined

      if (typeof psList === 'function') {
        psListFunction = psList as PsListFn
      } else {
        const candidate = (psList as unknown as { default?: unknown }).default
        if (typeof candidate === 'function') {
          psListFunction = candidate as PsListFn
        }
      }

      if (!psListFunction) {
        throw new Error('ps-list module did not export a valid function')
      }

      const processes = await psListFunction()
      this.procCache.clear()

      for (const process of processes) {
        this.procCache.set(process.pid, {
          pid: process.pid,
          name: process.name,
          cmd: process.cmd,
          cpu: process.cpu,
          memory: process.memory,
          ppid: process.ppid
        })
      }
    } catch (error) {
      logger.error('Failed to refresh process cache:', error)
    }
  }

  getProcessName(pid: number): string | undefined {
    const name = this.procCache.get(pid)?.name
    // if (!name && pid !== 0) {
    //   logger.debug(`PID ${pid} not found in cache (cache has ${this.procCache.size} entries)`)
    // }
    return name
  }

  getProcDetails(pid: number): ProcDetails | undefined {
    return this.procCache.get(pid)
  }

  async startPolling(interval: number = PROCESS_POLL_INTERVAL_MS): Promise<void> {
    await this.refreshProcesses()
    if (this.pollingTimer) clearInterval(this.pollingTimer)
    this.pollingTimer = setInterval(() => this.refreshProcesses(), interval)
  }

  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
      this.pollingTimer = null
    }
  }
}
