import { PacketMetadata, NetworkConnection, UDPPortMapping } from '@shared/interfaces/common'
import { normalizeIPv6 } from '@shared/utils/address-normalizer'
import { ProcessTracker } from './process-tracker'
import { ConnectionTracker } from './connection-tracker'
import { PacketConMatcher } from './packet-con-matcher'
import { systemPorts, systemProtocols } from '@main/config/constants'
export class ProcConManager {
  private readonly matcher: PacketConMatcher = new PacketConMatcher()
  private packetQueue: PacketMetadata[] = []
  private readonly localIPs: Set<string>

  constructor(
    private readonly processTracker: ProcessTracker,
    private readonly connectionTracker: ConnectionTracker,
    localIPs: string[]
  ) {
    this.localIPs = new Set(localIPs.map((ip) => normalizeIPv6(ip)))
    this.matcher.setLocalIPs(localIPs)
  }

  updateProcConInfo(): void {
    const connections = this.connectionTracker.getConnections()
    connections.forEach((conn) => {
      if (conn.pid) {
        conn.procName = this.processTracker.getProcessName(conn.pid) ?? 'UNKNOWN'
      } else {
        conn.procName = 'UNKNOWN'
      }
    })

    const tcpConMap = this.connectionTracker.getTCPConMap()
    tcpConMap.forEach((info) => {
      if (info.pid && !info.procName) {
        info.procName = this.processTracker.getProcessName(info.pid) ?? 'UNKNOWN'
      }
    })

    this.connectionTracker.getUDPMap().forEach((mapping) => {
      if (mapping.pid && !mapping.procName) {
        mapping.procName = this.processTracker.getProcessName(mapping.pid) ?? 'UNKNOWN'
      }
    })

    this.matcher.updateConMap(connections)
  }

  enqueuePacket(pkt: PacketMetadata): void {

    if (this.isSystemPacket(pkt)) {
      pkt.pid = -1
      pkt.procName = 'SYSTEM'
      this.packetQueue.push(pkt)
      return
    }
    if (!pkt.protocol?.startsWith('UDP')) {
      const conn = this.matcher.matchPacketToCon(pkt)

      if (conn) {
        pkt.pid = conn?.pid
        pkt.procName = conn?.procName ?? 'UNKNOWN'
      } else {
        const srcIsLocal = this.localIPs.has(pkt.srcIP ?? '')
        const dstIsLocal = this.localIPs.has(pkt.dstIP ?? '')
        const tcpMap = this.connectionTracker.getTCPConMap()
        let info: { pid: number; procName: string; lastSeen: number } | undefined

        if (dstIsLocal && pkt.dstIP && pkt.dstport) {
          info = tcpMap.get(`${pkt.dstIP}:${pkt.dstport}`)

          if (!info) {
            const wildcard = pkt.dstIP.includes(':') ? '::' : '0.0.0.0'
            info = tcpMap.get(`${wildcard}:${pkt.dstport}`)
          }
        }

        if (!info && srcIsLocal && pkt.srcIP && pkt.srcport) {
          info = tcpMap.get(`${pkt.srcIP}:${pkt.srcport}`)

          if (!info) {
            const wildcard = pkt.srcIP.includes(':') ? '::' : '0.0.0.0'
            info = tcpMap.get(`${wildcard}:${pkt.srcport}`)
          }
        }

        pkt.pid = info?.pid
        pkt.procName = info?.procName ?? 'UNKNOWN'
      }

      this.packetQueue.push(pkt)
    } else {
      void this.matchUDPPacket(pkt)
    }
  }

  private isSystemPacket(pkt: PacketMetadata): boolean {
    if (systemProtocols.has(pkt.protocol || '')) return true
    const srcIP = pkt.srcIP ?? ''
    const dstIP = pkt.dstIP ?? ''

    if (srcIP.startsWith('224.') || dstIP.startsWith('224.')) return true
    if (srcIP.startsWith('ff') || dstIP.startsWith('ff')) return true
    if (srcIP.startsWith('169.254.') || dstIP.startsWith('169.254.')) return true
    if (srcIP.startsWith('fe80:') || dstIP.startsWith('fe80:')) return true
    if (dstIP === '255.255.255.255') return true

    if ((systemPorts.has(pkt.srcport ?? 0)) || (systemPorts.has(pkt.dstport ?? 0))) {
      return true
    }
    return false
  }

  private async matchUDPPacket(pkt: PacketMetadata): Promise<void> {
    const srcIsLocal = this.localIPs.has(pkt.srcIP ?? '')
    const dstIsLocal = this.localIPs.has(pkt.dstIP ?? '')

    let mapping: UDPPortMapping | undefined

    if (dstIsLocal && pkt.dstIP && pkt.dstport) {
      mapping = this.connectionTracker.getUDPMapping(pkt.dstIP, pkt.dstport)
    } else if (srcIsLocal && pkt.srcIP && pkt.srcport) {
      mapping = this.connectionTracker.getUDPMapping(pkt.srcIP, pkt.srcport)
    }

    pkt.pid = mapping?.pid

    if (mapping?.pid && !mapping.procName) {
      mapping.procName = this.processTracker.getProcessName(mapping.pid) ?? 'UNKNOWN'
    }

    pkt.procName = mapping?.procName ?? 'UNKNOWN'
    if (mapping) mapping.lastSeen = Date.now()

    this.packetQueue.push(pkt)
  }

  flushQueue(): PacketMetadata[] {
    const queue = this.packetQueue
    this.packetQueue = []
    return queue
  }

  getConnections(): NetworkConnection[] {
    return this.matcher.getConnections()
  }
}
