import { PacketMetadata, NetworkConnection, UDPPortMapping } from '@shared/interfaces/common'
import { normalizeIPv6 } from '@shared/utils/address-normalizer'
import { ProcessTracker } from './process-tracker'
import { ConnectionTracker } from './connection-tracker'
import { PacketConMatcher } from './packet-con-matcher'

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
    if (!pkt.protocol?.startsWith('udp')) {
      const conn = this.matcher.matchPacketToCon(pkt)
      pkt.pid = conn?.pid
      pkt.procName = conn?.procName ?? 'UNKNOWN'
      this.packetQueue.push(pkt)
    } else {
      void this.matchUDPPacket(pkt)
    }
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
