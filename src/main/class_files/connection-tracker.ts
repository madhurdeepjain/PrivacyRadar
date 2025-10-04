const netstat: typeof import('node-netstat') = require('node-netstat')
import { NetworkConnection, UDPPortMapping } from '../interfaces/common'
import { normalizeIPv6 } from '../utils/address-normalizer'

/*
  Uses netstat to scan for all active network connections.
  It does not scan or touch network traffic.
  It returns an array of:
  {
    protocol: 'tcp6',
    local: { port: 65083, address: '::1' },
    remote { port: 5421, address: '::1' },
    state: 'ESTABLISHED',
    pid: 3276
  }
*/

export class ConnectionTracker {
  private connections: NetworkConnection[] = []
  private udpPortMap: Map<string, UDPPortMapping> = new Map()
  private tcpConMap: Map<string, { pid: number; procName: string; lastSeen: number }> = new Map()
  private pollingTimer: NodeJS.Timeout | null = null
  private isRefreshing = false

  async refreshConnections(): Promise<void> {
    if (this.isRefreshing) return
    this.isRefreshing = true

    //create connectionsList array and caches for udp and tcp
    const connectionsList: NetworkConnection[] = []
    const udpMap: Map<string, UDPPortMapping> = new Map()
    const tcpMap: Map<string, { pid: number; procName: string; lastSeen: number }> = new Map()

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Netstat timeout')), 5000)

        netstat({ filter: {} }, (data: any) => {
          try {

            const proto = (data.protocol || '').toUpperCase()
            const localAddr = normalizeIPv6(data.local?.address || '')
            const localPort = data.local?.port
            const remoteAddr = data.remote?.address ? normalizeIPv6(data.remote.address) : undefined
            const state = data.state || ''

            //ignore irrelevant results
            if (!localPort || !data.pid) return
            if (this.isLoopback(localAddr) || (remoteAddr && this.isLoopback(remoteAddr))) return

            //TCP is connection oriented, so we add regardless
            if (proto.startsWith('TCP')) {
              connectionsList.push({
                pid: data.pid,
                procName: '',
                srcaddr: localAddr,
                srcport: localPort,
                dstaddr: remoteAddr,
                dstport: data.remote?.port,
                protocol: proto,
                state: state
              })

              //these are likely to be more active, add to cache
              if (state === 'ESTABLISHED' || state === 'LISTENING') {
                tcpMap.set(`${localAddr}:${localPort}`, {
                  pid: data.pid,
                  procName: '',
                  lastSeen: Date.now()
                })
              }

              //UDP results will usually only have partial info
            } else if (proto.startsWith('UDP')) {
              const isListener = !remoteAddr || remoteAddr === '*' || remoteAddr === '0.0.0.0' || remoteAddr === '::'

              //at the very least we want source port, address
              const mapping: UDPPortMapping = {
                port: localPort,
                address: localAddr,
                pid: data.pid,
                procName: '',
                lastSeen: Date.now(),
                isListener: isListener
              }

              if (isListener) {
                //make 2 entries, local port, local port + addr
                udpMap.set(`${localAddr}:${localPort}`, { ...mapping })
                udpMap.set(`:${localPort}`, { ...mapping, address: '' })
              } else {
                udpMap.set(`${localAddr}:${localPort}`, mapping)
              }

              //add all udp results to connectionsList
              connectionsList.push({
                pid: data.pid,
                procName: '', //enriched separatedly
                srcaddr: localAddr,
                srcport: localPort,
                dstaddr: remoteAddr,
                dstport: data.remote?.port,
                protocol: proto,
                state: isListener ? 'LISTENING' : 'ESTABLISHED'
              })
            }
          } catch (error) {
            // Skip malformed
          }
        })

        setTimeout(() => { clearTimeout(timeout); resolve() }, 100)
      })

      //refresh UDP cache and add set of new entries
      this.cleanupStale()
      udpMap.forEach((value, key) => this.udpPortMap.set(key, value))
      this.tcpConMap = tcpMap
      this.connections = connectionsList

    } catch (error) {
      console.error('Netstat refresh failed:', error)
    } finally {
      this.isRefreshing = false
    }
  }

  startPolling(interval: number = 300): void {
    this.refreshConnections()
    if (this.pollingTimer) clearInterval(this.pollingTimer)
    this.pollingTimer = setInterval(() => this.refreshConnections(), interval)
  }

  stopPolling(): void {
    if (this.pollingTimer) clearInterval(this.pollingTimer)
    this.pollingTimer = null
  }

  //cleanup udpPortMap
  private cleanupStale(): void {
    const now = Date.now()
    const staleThreshold = 30000
    const toDelete: string[] = []

    this.udpPortMap.forEach((mapping, key) => {
      if (!mapping.isListener && (now - mapping.lastSeen > staleThreshold)) {
        toDelete.push(key)
      }
    })

    toDelete.forEach(key => this.udpPortMap.delete(key))
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

  //key = address:port value = pid, etc
  getUDPMapping(ip: string, port: number): UDPPortMapping | undefined {
    let mapping = this.udpPortMap.get(`${ip}:${port}`)
    if (mapping) return mapping

    mapping = this.udpPortMap.get(`:${port}`)
    if (mapping?.isListener) return mapping

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