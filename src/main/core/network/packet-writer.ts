import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PacketMetadata, NetworkConnection } from '@shared/interfaces/common'
import { logger } from '@infra/logging'

type PacketType = 'ipv4Tcp' | 'ipv4Udp' | 'ipv6Tcp' | 'ipv6Udp' | 'system'

export class PacketWriter {
  private readonly files: Map<PacketType, string> = new Map()
  private readonly isFirstPacket: Map<PacketType, boolean> = new Map()
  private readonly procConFile: string
  private isFirstProcCon = true

  constructor(basePath: string) {
    const types: PacketType[] = ['ipv4Tcp', 'ipv4Udp', 'ipv6Tcp', 'ipv6Udp', 'system']

    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true })
    }

    types.forEach((type) => {
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
      logger.error(`Failed to write packet to ${type}`, error)
    }
  }

  writeProcConSnapshot(connections: NetworkConnection[]): void {
    const snapshot = {
      timestamp: Date.now(),
      connectionCount: connections.length,
      connections
    }

    try {
      const prefix = this.isFirstProcCon ? '  ' : ',\n  '
      this.isFirstProcCon = false
      appendFileSync(
        this.procConFile,
        prefix + JSON.stringify(snapshot, null, 2).split('\n').join('\n  ')
      )
    } catch (error) {
      logger.error('Failed to write procCon snapshot', error)
    }
  }

  private determineType(pkt: PacketMetadata): PacketType | null {
    const protocol = pkt.protocol?.toUpperCase()

    if (pkt.pid === -1 || pkt.procName === 'SYSTEM') {
      return 'system'
    }

    const isIPv6 = pkt.ipv6 !== undefined || pkt.srcIP?.includes(':')

    if (protocol?.includes('TCP')) {
      return isIPv6 ? 'ipv6Tcp' : 'ipv4Tcp'
    }
    if (protocol?.includes('UDP')) {
      return isIPv6 ? 'ipv6Udp' : 'ipv4Udp'
    }

    if (protocol) {
      return 'system'
    }

    return null
  }

  close(): void {
    this.files.forEach((file) => {
      try {
        appendFileSync(file, '\n]\n')
      } catch (error) {
        logger.error('Failed to close file', error)
      }
    })

    try {
      appendFileSync(this.procConFile, '\n]\n')
    } catch (error) {
      logger.error('Failed to close procCon file', error)
    }
  }
}
