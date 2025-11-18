import psList, { ProcessDescriptor } from 'ps-list'
import { PROCESS_POLL_INTERVAL_MS } from '@config/constants'
import { logger } from '@infra/logging'
import { ProcDetails, ProcessTree } from '@shared/interfaces/common'

/**
 * Maintains a cache of running processes sourced from ps-list.
 */
export class ProcessTracker {
  private readonly procCache = new Map<number, ProcDetails>()
  private readonly processTrees = new Map<number, ProcessTree>()
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

      this.buildProcessTrees()
    } catch (error) {
      logger.error('Failed to refresh process cache:', error)
    }
  }

  private buildProcessTrees(): void {
    this.processTrees.clear()

    this.procCache.forEach((_proc, pid) => {
      const rootPid = this.findRootParent(pid)

      if (!this.processTrees.has(rootPid)) {
        const rootProc = this.procCache.get(rootPid)
        this.processTrees.set(rootPid, {
          rootPid,
          rootName: rootProc?.name ?? 'Unknown',
          children: new Set()
        })
      }

      this.processTrees.get(rootPid)!.children.add(pid)
    })
  }

  findRootParent(pid: number): number {
    const visited = new Set<number>()
    let current = pid

    while (current !== 0) {
      if (visited.has(current)) break
      visited.add(current)
      const proc = this.procCache.get(current)
      if (!proc || !proc.ppid || proc.ppid === 0) break
      current = proc.ppid
    }
    return current
  }

  getProcess(pid: number): ProcDetails | undefined {
    return this.procCache.get(pid)
  }

  getProcessName(pid: number): string | undefined {
    const name = this.procCache.get(pid)?.name
    return name
  }

  getProcessTree(rootPid: number): number[] {
    const tree = this.processTrees.get(rootPid)
    return tree ? Array.from(tree.children) : []
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
