import { ProcDetails } from '../interfaces/common'
import psList from 'ps-list'

/*
  Uses ps-list to return info about all running processes.
  Most of them are not connected with the internet, but there
  is no way for us to tell using ps-list alone.
  maintains a map where key = pid, value = name, cpu, mem, etc
*/

export class ProcessTracker {
  private procCache = new Map<number, ProcDetails>()
  private pollingTimer: NodeJS.Timeout | null = null

  async refreshProcesses(): Promise<void> {
    try {
      const psListFunction = typeof psList === 'function' ? psList : (psList as any).default

      if (!psListFunction || typeof psListFunction !== 'function') {
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
      console.error('Failed to refresh process cache:', error)
    }
  }

  getProcessName(pid: number): string | undefined {
    const name = this.procCache.get(pid)?.name
    if (!name && pid !== 0) {
      console.log(`DEBUG: PID ${pid} not found in cache (cache has ${this.procCache.size} entries)`)
    }
    return name
  }

  getProcDetails(pid: number): ProcDetails | undefined {
    return this.procCache.get(pid)
  }
  
  //1 second refresh rate
  async startPolling(interval: number = 1000): Promise<void> {
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