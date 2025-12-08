import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '@infra/db/schema'
import { globalSnapshots, applicationSnapshots, processSnapshots } from '@infra/db/schema'
import { ApplicationRegistry, GlobalRegistry, ProcessRegistry } from '@shared/interfaces/common'
import { logger } from '@infra/logging'
import { RegistryWriter } from './registry-writer'
import { isDevelopment } from '@shared/utils/environment'

export class RegistryRepository {
  private db: BetterSQLite3Database<typeof schema>
  private jsonWriter?: RegistryWriter

  constructor(database: BetterSQLite3Database<typeof schema>, jsonBasePath?: string) {
    this.db = database

    if (isDevelopment() && jsonBasePath) {
      this.jsonWriter = new RegistryWriter(jsonBasePath)
      logger.info('RegistryRepository: JSON debug files enabled')
    }
  }

  async writeRegistries(
    globalRegistry: Map<string, GlobalRegistry>,
    appRegistries: Map<string, ApplicationRegistry>,
    processRegistries: Map<string, ProcessRegistry>
  ): Promise<void> {
    try {
      logger.info('Writing registries to database', {
        globalCount: globalRegistry.size,
        appCount: appRegistries.size,
        processCount: processRegistries.size
      })
      await Promise.all([
        this.writeGlobalSnapshots(globalRegistry),
        this.writeApplicationSnapshots(appRegistries),
        this.writeProcessSnapshots(processRegistries)
      ])

      logger.info('Successfully wrote registries to database')

      if (this.jsonWriter) {
        this.jsonWriter.writeRegistries(globalRegistry, appRegistries, processRegistries)
      }
    } catch (error) {
      logger.error('Failed to write registries to database', error)
      throw error
    }
  }

  private async insertSnapshots<T>(
    snapshots: T[],
    table: typeof globalSnapshots | typeof applicationSnapshots | typeof processSnapshots,
    typeName: string
  ): Promise<void> {
    logger.debug(`Prepared ${snapshots.length} ${typeName} snapshots`)
    if (snapshots.length > 0) {
      await this.db.insert(table).values(snapshots as any)
    }
  }

  private async writeGlobalSnapshots(registry: Map<string, GlobalRegistry>): Promise<void> {
    const snapshots = Array.from(registry.values()).map((reg) => ({
      interfaceName: reg.interfaceName,
      totalPackets: reg.totalPackets,
      totalBytesSent: reg.totalBytesSent,
      totalBytesReceived: reg.totalBytesReceived,
      ipv4Packets: reg.ipv4Packets,
      ipv6Packets: reg.ipv6Packets,
      tcpPackets: reg.tcpPackets,
      udpPackets: reg.udpPackets,
      ipv4Percent: Math.round(reg.ipv4Percent),
      ipv6Percent: Math.round(reg.ipv6Percent),
      tcpPercent: Math.round(reg.tcpPercent),
      udpPercent: Math.round(reg.udpPercent),
      inboundBytes: reg.inboundBytes,
      outboundBytes: reg.outboundBytes,
      firstSeen: new Date(reg.firstSeen),
      lastSeen: new Date(reg.lastSeen)
    }))
    await this.insertSnapshots(snapshots, globalSnapshots, 'global')
  }

  private async writeApplicationSnapshots(
    registries: Map<string, ApplicationRegistry>
  ): Promise<void> {
    const snapshots = Array.from(registries.values()).map((reg) => ({
      appName: reg.appName,
      appDisplayName: reg.appDisplayName,
      totalPackets: reg.totalPackets,
      totalBytesSent: reg.totalBytesSent,
      totalBytesReceived: reg.totalBytesReceived,
      inboundBytes: reg.inboundBytes,
      outboundBytes: reg.outboundBytes,
      ipv4Packets: reg.ipv4Packets,
      ipv6Packets: reg.ipv6Packets,
      tcpPackets: reg.tcpPackets,
      udpPackets: reg.udpPackets,
      ipv4Percent: Math.round(reg.ipv4Percent),
      ipv6Percent: Math.round(reg.ipv6Percent),
      tcpPercent: Math.round(reg.tcpPercent),
      udpPercent: Math.round(reg.udpPercent),
      processCount: reg.processCount,
      processRegistryIDs: JSON.stringify(reg.processRegistryIDs),
      uniqueRemoteIPs: JSON.stringify(Array.from(reg.uniqueRemoteIPs)),
      uniqueDomains: JSON.stringify(Array.from(reg.uniqueDomains)),
      geoLocations: JSON.stringify(reg.geoLocations),
      interfaceStats: JSON.stringify(Object.fromEntries(reg.interfaceStats)),
      firstSeen: new Date(reg.firstSeen),
      lastSeen: new Date(reg.lastSeen)
    }))
    await this.insertSnapshots(snapshots, applicationSnapshots, 'application')
  }

  private async writeProcessSnapshots(registries: Map<string, ProcessRegistry>): Promise<void> {
    const snapshots = Array.from(registries.values()).map((reg) => ({
      processId: reg.id,
      appName: reg.appName,
      pid: reg.pid,
      parentPID: reg.parentPID,
      procName: reg.procName,
      exePath: reg.exePath || null,
      isRootProcess: reg.isRootProcess,
      totalPackets: reg.totalPackets,
      totalBytesSent: reg.totalBytesSent,
      totalBytesReceived: reg.totalBytesReceived,
      inboundBytes: reg.inboundBytes,
      outboundBytes: reg.outboundBytes,
      ipv4Packets: reg.ipv4Packets,
      ipv6Packets: reg.ipv6Packets,
      tcpPackets: reg.tcpPackets,
      udpPackets: reg.udpPackets,
      ipv4Percent: Math.round(reg.ipv4Percent),
      ipv6Percent: Math.round(reg.ipv6Percent),
      tcpPercent: Math.round(reg.tcpPercent),
      udpPercent: Math.round(reg.udpPercent),
      uniqueRemoteIPs: JSON.stringify(Array.from(reg.uniqueRemoteIPs)),
      geoLocations: JSON.stringify(reg.geoLocations),
      interfaceStats: JSON.stringify(Object.fromEntries(reg.interfaceStats)),
      firstSeen: new Date(reg.firstSeen),
      lastSeen: new Date(reg.lastSeen)
    }))
    await this.insertSnapshots(snapshots, processSnapshots, 'process')
  }

  async close(): Promise<void> {
    if (this.jsonWriter) {
      this.jsonWriter.close()
    }
    logger.info('RegistryRepository closed')
  }
}
