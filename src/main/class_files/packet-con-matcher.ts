import { PacketMetadata, NetworkConnection } from '../interfaces/common'

/*
  Creates a Bidirectional key for full 5 tuple connections.
  It also creates a bidirectional key for partial tuples.
*/

export class PacketConMatcher {
  private connectionMap: Map<string, NetworkConnection> = new Map()

  //
  private createBidirectionalKey(
    addr1: string,
    port1: number,
    addr2: string | undefined, 
    port2: number | undefined,
    protocol: string
  ): string | null {

    //Reject malformed packets
    if (!addr1 || !port1 || !protocol) return null
    const proto = protocol.toUpperCase()

    //For UDP with PARTIAL destination info
    if (!addr2 || !port2) {
      return `${addr1}:${port1}|${proto}`
    }

    // Create bidirectional key by sorting endpoints
    const endpoint1 = `${addr1}:${port1}`
    const endpoint2 = `${addr2}:${port2}`
    const [sortedA, sortedB] = [endpoint1, endpoint2].sort()
    return `${sortedA}|${sortedB}|${proto}`
  }

  // Update connections map
  updateConMap(connections: NetworkConnection[]): void {
    const newMap = new Map<string, NetworkConnection>() //Build new map

    for (const conn of connections) {
      const key = this.createBidirectionalKey(
        conn.srcaddr!, 
        conn.srcport!,
        conn.dstaddr, 
        conn.dstport,
        conn.protocol
      )
      if (key) {
        newMap.set(key, conn)
      }
    }
    this.connectionMap = newMap //swap
  }

  //Create packet key
  private createPacketKey(pkt: PacketMetadata): string | null {

    if (!pkt.srcIP || !pkt.srcport || !pkt.protocol) return null

    const key = this.createBidirectionalKey(
      pkt.srcIP, 
      pkt.srcport,
      pkt.dstIP, 
      pkt.dstport,
      pkt.protocol
    )

    return key
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

  //Get all connections
  getConnections(): NetworkConnection[] {
    return Array.from(this.connectionMap.values())
  }

  //Get connection count
  getConnectionCount(): number {
    return this.connectionMap.size
  }

  //Debug method to get connection keys
  getDebugKeys(): string[] {
    return Array.from(this.connectionMap.keys())
  }
}