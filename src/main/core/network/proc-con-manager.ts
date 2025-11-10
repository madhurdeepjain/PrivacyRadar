import { PacketMetadata, NetworkConnection, UDPPortMapping } from '@shared/interfaces/common'
import { normalizeIPv6 } from '@shared/utils/address-normalizer'
import { ProcessTracker } from './process-tracker'
import { ConnectionTracker } from './connection-tracker'
import { PacketConMatcher } from './packet-con-matcher'
import { SYSTEM_PROTOCOLS, SYSTEM_PORTS } from '@main/config/constants'

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

    this.connectionTracker.getTCPConMap().forEach((mapping) => {
      if (mapping.pid && !mapping.procName) {
        mapping.procName = this.processTracker.getProcessName(mapping.pid) ?? 'UNKNOWN'
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

    if (!pkt.protocol?.startsWith('udp')) {
      void this.matchTCPPacket(pkt)
      void this.matchTCPPacket(pkt)
    } else {
      void this.matchUDPPacket(pkt)
    }
  }

  private async matchTCPPacket(pkt: PacketMetadata): Promise<void> {
    const conn = this.matcher.matchPacketToCon(pkt)

    if (conn) {
      pkt.pid = conn.pid
      pkt.procName = conn.procName ?? 'UNKNOWN_CONN'
      this.packetQueue.push(pkt)
      return
    }

    const srcIsLocal = this.localIPs.has(pkt.srcIP ?? '')
    const localIP = srcIsLocal ? pkt.srcIP : pkt.dstIP
    const localPort = srcIsLocal ? pkt.srcport : pkt.dstport

    if (!localIP || !localPort) {
      pkt.procName = 'UNKNOWN_MATCHTCP_PKT'
      this.packetQueue.push(pkt)
      return
    }

    const mapping = this.connectionTracker.getTCPConMap().get(`${localIP}:${localPort}`)

    if (mapping) {
      pkt.pid = mapping.pid

      if (mapping.pid && !mapping.procName) {
        mapping.procName =
          this.processTracker.getProcessName(mapping.pid) ?? 'UNKNOWN_PROCTRACK_MATCH_FAIL'
      }

      pkt.procName = mapping.procName ?? 'UNKNOWN'
      mapping.lastSeen = Date.now()

      const tcpConn: NetworkConnection = {
        pid: mapping.pid,
        procName: mapping.procName,
        srcaddr: srcIsLocal ? pkt.srcIP! : pkt.dstIP!,
        srcport: srcIsLocal ? pkt.srcport! : pkt.dstport!,
        dstaddr: srcIsLocal ? pkt.dstIP : pkt.srcIP,
        dstport: srcIsLocal ? pkt.dstport : pkt.srcport,
        protocol: pkt.protocol || 'tcp',
        state: 'ESTABLISHED'
      }

      this.promoteToFullCon(pkt, tcpConn)
    } else {
      pkt.procName = 'UNKNOWN_MATCHTCP_PKT'
    }

    this.packetQueue.push(pkt)
  }

  private async matchUDPPacket(pkt: PacketMetadata): Promise<void> {
    const conn = this.matcher.matchPacketToCon(pkt)

    if (conn) {
      pkt.pid = conn.pid
      pkt.procName = conn.procName ?? 'UNKNOWN_CONN'
      this.packetQueue.push(pkt)
      return
    }

    const srcIsLocal = this.localIPs.has(pkt.srcIP ?? '')
    const dstIsLocal = this.localIPs.has(pkt.dstIP ?? '')
    let mapping: UDPPortMapping | undefined

    if (dstIsLocal && pkt.dstIP && pkt.dstport) {
      mapping = this.connectionTracker.getUDPMapping(pkt.dstIP, pkt.dstport)
    } else if (srcIsLocal && pkt.srcIP && pkt.srcport) {
      mapping = this.connectionTracker.getUDPMapping(pkt.srcIP, pkt.srcport)
    }

    if (mapping) {
      pkt.pid = mapping.pid
      if (mapping.pid && !mapping.procName) {
        mapping.procName =
          this.processTracker.getProcessName(mapping.pid) ?? 'UNKNOWN_PROCTRACK_MATCH_FAIL'
      }
      pkt.procName = mapping.procName ?? 'UNKNOWN'
      mapping.lastSeen = Date.now()

      const udpConn: NetworkConnection = {
        pid: mapping.pid,
        procName: mapping.procName || '',
        srcaddr: srcIsLocal ? pkt.srcIP! : pkt.dstIP!,
        srcport: srcIsLocal ? pkt.srcport! : pkt.dstport!,
        dstaddr: srcIsLocal ? pkt.dstIP : pkt.srcIP,
        dstport: srcIsLocal ? pkt.dstport : pkt.srcport,
        protocol: 'udp',
        state: 'ESTABLISHED'
      }
      this.promoteToFullCon(pkt, udpConn)
    } else {
      pkt.procName = 'UNKNOWN_MATCHUDP_PKT'
    }
    this.packetQueue.push(pkt)
  }

  private promoteToFullCon(pkt: PacketMetadata, conn: NetworkConnection): void {
    if (!pkt.srcIP || !pkt.dstIP || !pkt.srcport || !pkt.dstport || !conn.pid) return
    this.connectionTracker.getConnections().push(conn)
  }

  private isSystemPacket(pkt: PacketMetadata): boolean {
    const protocol = pkt.protocol?.toLowerCase() ?? ''
    if (SYSTEM_PROTOCOLS.has(protocol)) {
      return true
    }
    const srcPort = pkt.srcport ?? 0
    const dstPort = pkt.dstport ?? 0

    if (SYSTEM_PORTS.has(srcPort) || SYSTEM_PORTS.has(dstPort)) {
      if (!pkt.pid || pkt.pid === 0 || pkt.pid === 4) {
        return true
      }
    }

    return false
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
