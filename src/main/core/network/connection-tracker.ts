import {
  CONNECTION_POLL_INTERVAL_MS,
  NETSTAT_TIMEOUT_MS,
  UDP_STALE_THRESHOLD_MS
} from '@config/constants'
import { logger } from '@infra/logging'
import { NetworkConnection, UDPPortMapping } from '@shared/interfaces/common'
import { normalizeIPv6 } from '@shared/utils/address-normalizer'
import { collectNetstatRows } from './netstat-runner'

export class ConnectionTracker {
  private connections: NetworkConnection[] = []
  private readonly udpPortMap: Map<string, UDPPortMapping> = new Map()
  private tcpConMap: Map<string, { pid: number; procName: string; lastSeen: number }> = new Map()
  private pollingTimer: NodeJS.Timeout | null = null
  private isRefreshing = false

  async refreshConnections(): Promise<void> {
    if (this.isRefreshing) return
    this.isRefreshing = true

    const connectionsList: NetworkConnection[] = []
    const udpMap: Map<string, UDPPortMapping> = new Map()
    const tcpMap: Map<string, { pid: number; procName: string; lastSeen: number }> = new Map()

    try {
      const rows = await collectNetstatRows({ timeoutMs: NETSTAT_TIMEOUT_MS })

      rows.forEach((row) => {
        try {
          const proto = (row.protocol ?? '').toLowerCase()
          const localAddr = normalizeIPv6(row.local?.address ?? '')
          const localPort = row.local?.port
          const remoteAddr = row.remote?.address ? normalizeIPv6(row.remote.address) : undefined
          const state = row.state ?? ''

          if (!localPort || !row.pid) return
          if (this.isLoopback(localAddr) || (remoteAddr && this.isLoopback(remoteAddr))) return

          if (proto.startsWith('tcp')) {
            if (state === 'ESTABLISHED' && remoteAddr && row.remote?.port) {
              connectionsList.push({
                pid: row.pid,
                procName: '',
                srcaddr: localAddr,
                srcport: localPort,
                dstaddr: remoteAddr,
                dstport: row.remote?.port ?? undefined,
                protocol: proto,
                state
              })

              if (state === 'ESTABLISHED' || state === 'LISTENING') {
                tcpMap.set(`${localAddr}:${localPort}`, {
                  pid: row.pid,
                  procName: '',
                  lastSeen: Date.now()
                })
              }
            }
          } else if (proto.startsWith('udp')) {
            const isListener =
              !remoteAddr ||
              remoteAddr === '*' ||
              remoteAddr === '0.0.0.0' ||
              remoteAddr === normalizeIPv6('::')

            const mapping: UDPPortMapping = {
              port: localPort,
              address: localAddr,
              pid: row.pid,
              procName: '',
              lastSeen: Date.now(),
              isListener
            }

            if (isListener) {
              udpMap.set(`${localAddr}:${localPort}`, { ...mapping })
              udpMap.set(`:${localPort}`, { ...mapping, address: '*' })
            } else {
              udpMap.set(`${localAddr}:${localPort}`, mapping)
            }

            connectionsList.push({
              pid: row.pid,
              procName: '',
              srcaddr: localAddr,
              srcport: localPort,
              dstaddr: remoteAddr,
              dstport: row.remote?.port ?? undefined,
              protocol: proto,
              state: isListener ? 'LISTENING' : 'ESTABLISHED'
            })
          }
        } catch (error) {
          logger.debug('Skipping malformed netstat row', error)
        }
      })

      this.cleanupStale()
      udpMap.forEach((value, key) => this.udpPortMap.set(key, value))
      this.tcpConMap = tcpMap
      this.connections = connectionsList
    } catch (error) {
      logger.error('Netstat refresh failed', error)
    } finally {
      this.isRefreshing = false
    }
  }

  startPolling(interval: number = CONNECTION_POLL_INTERVAL_MS): void {
    void this.refreshConnections()
    if (this.pollingTimer) clearInterval(this.pollingTimer)
    this.pollingTimer = setInterval(() => this.refreshConnections(), interval)
  }

  stopPolling(): void {
    if (this.pollingTimer) clearInterval(this.pollingTimer)
    this.pollingTimer = null
  }

  private cleanupStale(): void {
    const now = Date.now()
    const toDelete: string[] = []

    this.udpPortMap.forEach((mapping, key) => {
      if (!mapping.isListener && now - mapping.lastSeen > UDP_STALE_THRESHOLD_MS) {
        toDelete.push(key)
      }
    })

    toDelete.forEach((key) => this.udpPortMap.delete(key))
  }

  private isLoopback(ip: string | null): boolean {
    if (!ip) return false
    if (ip.includes('.')) return ip.startsWith('127.')
    const cleanIp = ip.split('%')[0].toLowerCase()
    return cleanIp === '::1' || cleanIp === '0000:0000:0000:0000:0000:0000:0000:0001'
  }

  getConnections(): NetworkConnection[] {
    return this.connections
  }

  getUDPMapping(ip: string, port: number): UDPPortMapping | undefined {
    const direct = this.udpPortMap.get(`${ip}:${port}`)
    if (direct) return direct

    const wildcard = this.udpPortMap.get(`:${port}`)
    if (wildcard?.isListener) return wildcard

    return undefined
  }

  getUDPMap(): Map<string, UDPPortMapping> {
    return this.udpPortMap
  }

  getTCPConMap(): Map<string, { pid: number; procName: string; lastSeen: number }> {
    return this.tcpConMap
  }

  setUDPMapping(key: string, mapping: UDPPortMapping): void {
    this.udpPortMap.set(key, mapping)
  }
}
