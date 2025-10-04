import { PacketMetadata, NetworkConnection, UDPPortMapping } from '../interfaces/common'
import { ProcessTracker } from './process-tracker'
import { ConnectionTracker } from './connection-tracker'
import { PacketConMatcher } from './packet-con-matcher'
import { normalizeIPv6 } from '../utils/address-normalizer'

/* 
  Oversees linking pid + name with decoded packets.
*/
export class ProcConManager {
  private matcher: PacketConMatcher = new PacketConMatcher()
  private packetQueue: PacketMetadata[] = []
  private localIPs: Set<string> = new Set()

  constructor(
    private processTracker: ProcessTracker,
    private connectionTracker: ConnectionTracker,
    localIPs: string[]
  ){
    this.localIPs = new Set(localIPs.map(ip => normalizeIPv6(ip)))
  }

  //get netstat info and enrich process names
  updateProcConInfo(): void {
    const connections = this.connectionTracker.getConnections()

    connections.forEach(conn => {
      if (conn.pid) {
        conn.procName = this.processTracker.getProcessName(conn.pid) || 'UNKNOWN'
      } else {
        conn.procName = 'UNKNOWN'
      }
    })

    //update TCP cache with proc names
    const tcpConMap = this.connectionTracker.getTCPConMap()
    tcpConMap.forEach((info) => {
      if (info.pid && !info.procName) {
        info.procName = this.processTracker.getProcessName(info.pid) || 'UNKNOWN'
      }
    })

    //update UDP cache with proc names
    this.connectionTracker.getUDPMap().forEach((mapping) => {
      if (mapping.pid && !mapping.procName) {
        mapping.procName = this.processTracker.getProcessName(mapping.pid) || 'UNKNOWN'
      }
    })

    //update local matcher with current enriched connections
    this.matcher.updateConMap(connections)
  }

  //add enriched packet to buffer
  enqueuePacket(pkt: PacketMetadata): void {
    if (!pkt.protocol?.startsWith('UDP')) {
      const conn = this.matcher.matchPacketToCon(pkt)
      pkt.pid = conn?.pid
      pkt.procName = conn?.procName || 'UNKNOWN'
      this.packetQueue.push(pkt)

    } else {
      this.matchUDPPacket(pkt).catch(err => console.error('UDP match error:', err))
    }
  }

  private async matchUDPPacket(pkt: PacketMetadata): Promise<void> {
    const srcIsLocal = this.localIPs.has(pkt.srcIP || '')
    const dstIsLocal = this.localIPs.has(pkt.dstIP || '')

    let mapping: UDPPortMapping | undefined

    //try caches first
    if (dstIsLocal && pkt.dstport) {
      mapping = this.connectionTracker.getUDPMapping(pkt.dstIP!, pkt.dstport)
    } else if (srcIsLocal && pkt.srcport) {
      mapping = this.connectionTracker.getUDPMapping(pkt.srcIP!, pkt.srcport)
    }

    pkt.pid = mapping?.pid

    if (mapping?.pid && !mapping.procName) {
      mapping.procName = this.processTracker.getProcessName(mapping.pid) || 'UNKNOWN'
    }

    pkt.procName = mapping?.procName || 'UNKNOWN'
    if (mapping) mapping.lastSeen = Date.now()

    console.log(`Final: PID=${pkt.pid}, procName=${pkt.procName}`)

    //push all packets until a better solution is implemented
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