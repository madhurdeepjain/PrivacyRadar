import { PacketMetadata } from '../interfaces/common'
import { writeFileSync, appendFileSync } from 'fs'
import { join } from 'path'

type PacketType = 'ipv4Tcp' | 'ipv4Udp' | 'ipv6Tcp' | 'ipv6Udp' | 'system'

/* 
  Right now this class writes to 5 separate JSONS.
  Ideally this would be converted to writing to DB(s)
*/
export class PacketWriter {
  private files: Map<PacketType, string> = new Map()
  private isFirstPacket: Map<PacketType, boolean> = new Map()
  private procConFile: string
  private isFirstProcCon = true

  constructor(basePath: string) {
    const types: PacketType[] = ['ipv4Tcp', 'ipv4Udp', 'ipv6Tcp', 'ipv6Udp', 'system']

    types.forEach(type => {
      const file = join(basePath, `packets_${type}.json`)
      this.files.set(type, file)
      this.isFirstPacket.set(type, true)
      writeFileSync(file, '[\n')
    })

    this.procConFile = join(basePath, 'proccon_table.json')
    writeFileSync(this.procConFile, '[\n')
  }

  writePacket(pkt: PacketMetadata): void {
    const type = this.determineType(pkt)
    if (!type) return

    const file = this.files.get(type)
    if (!file) return

    try {
      const prefix = this.isFirstPacket.get(type) ? '  ' : ',\n  '
      this.isFirstPacket.set(type, false)
      appendFileSync(file, prefix + JSON.stringify(pkt, null, 2).split('\n').join('\n  '))
    } catch (error) {
      console.error(`Failed to write packet to ${type}:`, error)
    }
  }

  writeProcConSnapshot(connections: any[]): void {
    const snapshot = {
      timestamp: Date.now(),
      connectionCount: connections.length,
      connections: connections
    }

    try {
      const prefix = this.isFirstProcCon ? '  ' : ',\n  '
      this.isFirstProcCon = false
      appendFileSync(this.procConFile, prefix + JSON.stringify(snapshot, null, 2).split('\n').join('\n  '))
    } catch (e) {
      console.error('Failed to write procCon snapshot:', e)
    }
  }

  private determineType(pkt: PacketMetadata): PacketType | null {
    const protocol = pkt.protocol?.toUpperCase()
    const isIPv6 = pkt.ipv6 !== undefined || pkt.srcIP?.includes(':')

    //Handle TCP/UDP
    if (protocol?.includes('TCP')) {
      return isIPv6 ? 'ipv6Tcp' : 'ipv4Tcp'
    }
    if (protocol?.includes('UDP')) {
      return isIPv6 ? 'ipv6Udp' : 'ipv4Udp'
    }

    //Everything else (ICMP, ARP, IGMP, etc.) goes to system
    if (protocol) {
      return 'system'
    }

    return null
  }

  close(): void {
    this.files.forEach(file => {
      try {
        appendFileSync(file, '\n]\n')
      } catch (error) {
        console.error('Failed to close file:', error)
      }
    })

    try {
      appendFileSync(this.procConFile, '\n]\n')
    } catch (error) {
      console.error('Failed to close procCon file:', error)
    }
  }
}