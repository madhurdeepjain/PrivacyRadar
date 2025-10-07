import { PacketMetadata, NetworkConnection } from '@shared/interfaces/common'

export class PacketConMatcher {
  private connectionMap: Map<string, NetworkConnection> = new Map()

  private createBidirectionalKey(
    addr1: string,
    port1: number,
    addr2: string | undefined,
    port2: number | undefined,
    protocol: string
  ): string | null {
    if (!addr1 || !port1 || !protocol) return null
    const proto = protocol.toUpperCase()

    if (!addr2 || !port2) {
      return `${addr1}:${port1}|${proto}`
    }

    const endpoint1 = `${addr1}:${port1}`
    const endpoint2 = `${addr2}:${port2}`
    const [sortedA, sortedB] = [endpoint1, endpoint2].sort()
    return `${sortedA}|${sortedB}|${proto}`
  }

  updateConMap(connections: NetworkConnection[]): void {
    const newMap = new Map<string, NetworkConnection>()

    for (const conn of connections) {
      if (!conn.srcaddr || !conn.srcport || !conn.protocol) continue
      const key = this.createBidirectionalKey(
        conn.srcaddr,
        conn.srcport,
        conn.dstaddr,
        conn.dstport,
        conn.protocol
      )
      if (key) {
        newMap.set(key, conn)
      }
    }
    this.connectionMap = newMap
  }

  private createPacketKey(pkt: PacketMetadata): string | null {
    if (!pkt.srcIP || !pkt.srcport || !pkt.protocol) return null

    return this.createBidirectionalKey(pkt.srcIP, pkt.srcport, pkt.dstIP, pkt.dstport, pkt.protocol)
  }

  matchPacketToCon(pkt: PacketMetadata): NetworkConnection | null {
    const packetKey = this.createPacketKey(pkt)
    if (!packetKey) return null

    const conn = this.connectionMap.get(packetKey)
    if (conn) {
      return conn
    }

    return null
  }

  getConnections(): NetworkConnection[] {
    return Array.from(this.connectionMap.values())
  }

  getConnectionCount(): number {
    return this.connectionMap.size
  }

  getDebugKeys(): string[] {
    return Array.from(this.connectionMap.keys())
  }
}
