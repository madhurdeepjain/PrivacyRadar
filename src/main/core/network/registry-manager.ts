import {
  ApplicationRegistry,
  GlobalRegistry,
  PacketMetadata,
  ProcessRegistry,
  ProcDetails,
  GeoLocationData,
  EmptyStats
} from '@shared/interfaces/common'
import { ProcessTracker } from './process-tracker'
import { ConnectionTracker } from './connection-tracker'
import { GeoLocationService } from './geo-location'
import { FRIENDLY_APP_NAMES } from '@config/constants'
import { logger } from '@infra/logging'

const createEmptyStats = (): EmptyStats => ({
  totalPackets: 0,
  totalBytesSent: 0,
  totalBytesReceived: 0,
  inboundBytes: 0,
  outboundBytes: 0,
  ipv4Packets: 0,
  ipv6Packets: 0,
  tcpPackets: 0,
  udpPackets: 0,
  ipv4Percent: 0,
  ipv6Percent: 0,
  tcpPercent: 0,
  udpPercent: 0
})

export class RegManager {
  private globalRegistry: Map<string, GlobalRegistry> = new Map()
  private applicationRegistries: Map<string, ApplicationRegistry> = new Map()
  private processRegistries: Map<string, ProcessRegistry> = new Map()
  private localIPs: Set<string>
  private geoService: GeoLocationService

  constructor(
    private readonly processTracker: ProcessTracker,
    private readonly connectionTracker: ConnectionTracker,
    localIPs: string[]
  ) {
    this.localIPs = new Set(localIPs)
    this.geoService = new GeoLocationService()
  }

  processPacket(pkt: PacketMetadata): void {
    this.updateGlobalStats(pkt)

    const processRegistry = this.resolveProcessRegistry(pkt)
    this.updateProcessRegistryStats(processRegistry, pkt)
    this.updateApplicationRegistryStats(processRegistry.appName, pkt)
    this.tagPacket(pkt, processRegistry.id, processRegistry.appName, processRegistry.appName)
  }

  private tagPacket(pkt: PacketMetadata, id: string, appName: string, displayName: string): void {
    pkt.appRegistryID = id
    pkt.appName = appName
    pkt.appDisplayName = displayName
  }

  private updateGlobalStats(pkt: PacketMetadata): void {
    const interfaceName = pkt.interfaceName || 'default'

    if (!this.globalRegistry.has(interfaceName)) {
      const emptyStats = createEmptyStats()
      this.globalRegistry.set(interfaceName, {
        interfaceName,
        ...emptyStats,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      })
    }
    const global = this.globalRegistry.get(interfaceName)!
    this.updateStats(global, pkt)
  }

  private resolveProcessRegistry(pkt: PacketMetadata): ProcessRegistry {
    const classification = this.classifyPacket(pkt)
    const registryId = this.generateRegistryId(classification)

    if (this.processRegistries.has(registryId)) {
      return this.processRegistries.get(registryId)!
    }

    const processRegistry = this.createProcessRegistry(registryId, classification)
    this.processRegistries.set(registryId, processRegistry)
    this.addProcessRegistryToApp(processRegistry.appName, processRegistry.appName, registryId)

    return processRegistry
  }

  private classifyPacket(pkt: PacketMetadata): {
    pid: number
    appName: string
    appDisplayName: string
    procName: string
    isSystem: boolean
    isUnknown: boolean
  } {
    if (this.isSystemTraffic(pkt)) {
      return {
        pid: pkt.pid || 0,
        appName: 'System',
        appDisplayName: 'System',
        procName: 'System',
        isSystem: true,
        isUnknown: false
      }
    }

    if (!pkt.pid || pkt.procName?.startsWith('UNKNOWN')) {
      return {
        pid: pkt.pid || -1,
        appName: 'Unknown',
        appDisplayName: 'Unknown',
        procName: pkt.procName || 'Unknown',
        isSystem: false,
        isUnknown: true
      }
    }

    const pid = pkt.pid
    const proc = this.getProcessFromConnection(pkt) || this.processTracker.getProcess(pid)

    if (!proc) {
      return {
        pid,
        appName: pkt.procName || 'Unknown',
        appDisplayName: pkt.procName || 'Unknown',
        procName: pkt.procName || 'Unknown',
        isSystem: false,
        isUnknown: false
      }
    }

    const rootPID = this.processTracker.findRootParent(pid)
    const rootProc = this.processTracker.getProcess(rootPID)
    const appName = rootProc ? this.getFriendlyName(rootProc.name) : this.getFriendlyName(proc.name)

    return {
      pid,
      appName,
      appDisplayName: appName,
      procName: proc.name,
      isSystem: false,
      isUnknown: false
    }
  }

  private isSystemTraffic(pkt: PacketMetadata): boolean {
    if (pkt.procName === 'SYSTEM' || pkt.pid === 0 || pkt.pid === 4) {
      return true
    }

    //System/Network protocols not linked to a process
    const protocol = pkt.protocol?.toLowerCase()
    if (!pkt.pid && (protocol === 'arp' || protocol === 'icmp' || protocol === 'icmpv6')) {
      return true
    }

    return false
  }

  private generateRegistryId(classification: {
    pid: number
    appName: string
    isSystem: boolean
    isUnknown: boolean
  }): string {
    if (classification.isSystem) {
      return 'system'
    }

    if (classification.isUnknown) {
      return 'unknown'
    }

    return `${classification.appName.toLowerCase().replace(/\s+/g, '-')}-${classification.pid}`
  }

  private createProcessRegistry(
    id: string,
    classification: {
      pid: number
      appName: string
      appDisplayName: string
      procName: string
      isSystem: boolean
      isUnknown: boolean
    }
  ): ProcessRegistry {
    const emptyStats = createEmptyStats()
    return {
      id,
      appName: classification.appName,
      pid: classification.pid,
      parentPID: 0,
      procName: classification.procName,
      isRootProcess: true,
      ...emptyStats,
      uniqueRemoteIPs: new Set(),
      geoLocations: [],
      interfaceStats: new Map(),
      firstSeen: Date.now(),
      lastSeen: Date.now()
    }
  }

  private getProcessFromConnection(pkt: PacketMetadata): ProcDetails | null {
    const connections = this.connectionTracker.getConnections()
    const remoteIP = this.getRemoteIP(pkt)

    if (!remoteIP) return null

    const connection = connections.find(
      (conn) => (conn.dstaddr === remoteIP || conn.srcaddr === remoteIP) && conn.pid === pkt.pid
    )

    if (connection && connection.procName) {
      return {
        pid: connection.pid!,
        name: connection.procName,
        ppid: 0,
        cmd: connection.procName
      }
    }

    return null
  }

  private addProcessRegistryToApp(
    appName: string,
    appDisplayName: string,
    processRegistryId: string
  ): void {
    if (!this.applicationRegistries.has(appName)) {
      const emptyStats = createEmptyStats()
      this.applicationRegistries.set(appName, {
        appName,
        appDisplayName,
        ...emptyStats,
        uniqueRemoteIPs: new Set(),
        uniqueDomains: new Set(),
        geoLocations: [],
        interfaceStats: new Map(),
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        processRegistryIDs: [],
        processCount: 0
      })
    }
    const appRegistry = this.applicationRegistries.get(appName)!
    if (!appRegistry.processRegistryIDs.includes(processRegistryId)) {
      appRegistry.processRegistryIDs.push(processRegistryId)
      appRegistry.processCount++
    }
  }

  private updateProcessRegistryStats(registry: ProcessRegistry, pkt: PacketMetadata): void {
    this.updateStats(registry, pkt)

    const remoteIP = this.getRemoteIP(pkt)
    if (remoteIP) {
      registry.uniqueRemoteIPs.add(remoteIP)
      this.updateGeoLocationAsync(registry.geoLocations, remoteIP, pkt)
    }

    this.updateInterfaceStats(registry.interfaceStats, pkt)
  }

  private updateApplicationRegistryStats(appName: string, pkt: PacketMetadata): void {
    const appRegistry = this.applicationRegistries.get(appName)
    if (!appRegistry) return

    this.updateStats(appRegistry, pkt)

    const remoteIP = this.getRemoteIP(pkt)
    if (remoteIP) {
      appRegistry.uniqueRemoteIPs.add(remoteIP)
    }

    this.updateInterfaceStats(appRegistry.interfaceStats, pkt)
    this.aggregateGeoLocations(appRegistry)
  }

  private updateStats(
    registry: GlobalRegistry | ProcessRegistry | ApplicationRegistry,
    pkt: PacketMetadata
  ): void {
    const isIPv6 = this.isIPv6(pkt)
    const isTCP = pkt.protocol?.toLowerCase().startsWith('tcp')
    const direction = this.getDirection(pkt)
    const size = pkt.size || 0

    registry.totalPackets++
    registry.lastSeen = Date.now()

    isIPv6 ? registry.ipv6Packets++ : registry.ipv4Packets++
    isTCP ? registry.tcpPackets++ : registry.udpPackets++

    if (direction === 'outbound') {
      registry.totalBytesSent += size
      registry.outboundBytes += size
    } else if (direction === 'inbound') {
      registry.totalBytesReceived += size
      registry.inboundBytes += size
    }

    this.calculatePercentages(registry)
  }

  private updateGeoLocationAsync(
    geoLocations: GeoLocationData[],
    ip: string,
    pkt: PacketMetadata
  ): void {
    const direction = this.getDirection(pkt)
    const size = pkt.size || 0

    // Fire-and-forget async operation with proper error handling
    // We intentionally don't await this to avoid blocking packet processing
    ;(async () => {
      try {
        const cachedGeoData = await this.geoService.lookup(ip)

        if (!cachedGeoData.country && !cachedGeoData.city && !cachedGeoData.as) {
          return
        }

        const existing = geoLocations.find(
          (g) =>
            g.country === cachedGeoData.country &&
            g.city === cachedGeoData.city &&
            g.as === cachedGeoData.as
        )

        if (existing) {
          existing.packetCount++

          if (!existing.ips) existing.ips = []
          if (!existing.ips.includes(ip)) {
            existing.ips.push(ip)
          }
          if (direction === 'outbound') {
            existing.bytesSent += size
          } else if (direction === 'inbound') {
            existing.bytesReceived += size
          }
        } else {
          geoLocations.push({
            ...cachedGeoData,
            ips: [ip],
            packetCount: 1,
            bytesSent: direction === 'outbound' ? size : 0,
            bytesReceived: direction === 'inbound' ? size : 0
          })
        }
      } catch (error) {
        logger.debug(`Geo lookup failed for ${ip}:`, error)
      }
    })().catch((error) => {
      // Catch any errors from the IIFE itself (shouldn't happen, but safety net)
      logger.debug(`Geo lookup async wrapper failed for ${ip}:`, error)
    })
  }

  private aggregateGeoLocations(appRegistry: ApplicationRegistry): void {
    const aggregatedMap = new Map<string, GeoLocationData>()

    appRegistry.processRegistryIDs.forEach((procId) => {
      const procReg = this.processRegistries.get(procId)
      if (!procReg) return

      procReg.geoLocations.forEach((geo) => {
        const key = `${geo.country || 'Unknown'}-${geo.city || 'Unknown'}-${geo.as || 0}`
        const existing = aggregatedMap.get(key)

        if (existing) {
          existing.packetCount += geo.packetCount
          existing.bytesSent += geo.bytesSent
          existing.bytesReceived += geo.bytesReceived

          const geoIps = geo.ips || []
          const existingIps = existing.ips || []
          geoIps.forEach((ip) => {
            if (!existingIps.includes(ip)) {
              existingIps.push(ip)
            }
          })
          existing.ips = existingIps
        } else {
          aggregatedMap.set(key, {
            ...geo,
            ips: geo.ips ? [...geo.ips] : []
          })
        }
      })
    })

    appRegistry.geoLocations = Array.from(aggregatedMap.values())
  }

  private getRemoteIP(pkt: PacketMetadata): string | null {
    const direction = this.getDirection(pkt)

    if (direction === 'outbound' && pkt.dstIP && !this.localIPs.has(pkt.dstIP)) {
      return pkt.dstIP
    }
    if (direction === 'inbound' && pkt.srcIP && !this.localIPs.has(pkt.srcIP)) {
      return pkt.srcIP
    }

    return null
  }

  private updateInterfaceStats(
    interfaceStats: Map<string, { packets: number; bytesSent: number; bytesReceived: number }>,
    pkt: PacketMetadata
  ): void {
    const iface = pkt.interfaceName || 'default'
    const direction = this.getDirection(pkt)
    const size = pkt.size || 0

    if (!interfaceStats.has(iface)) {
      interfaceStats.set(iface, { packets: 0, bytesSent: 0, bytesReceived: 0 })
    }

    const stats = interfaceStats.get(iface)!
    stats.packets++

    if (direction === 'outbound') stats.bytesSent += size
    else if (direction === 'inbound') stats.bytesReceived += size
  }

  private isIPv6(pkt: PacketMetadata): boolean {
    return pkt.ipv6 !== undefined || pkt.srcIP?.includes(':') || pkt.dstIP?.includes(':') || false
  }

  private getDirection(pkt: PacketMetadata): 'inbound' | 'outbound' | 'unknown' {
    const srcLocal = pkt.srcIP ? this.localIPs.has(pkt.srcIP) : false
    const dstLocal = pkt.dstIP ? this.localIPs.has(pkt.dstIP) : false

    if (srcLocal && !dstLocal) return 'outbound'
    if (!srcLocal && dstLocal) return 'inbound'
    return 'unknown'
  }

  private getFriendlyName(procName: string): string {
    const name = procName.toLowerCase().replace('.exe', '').trim()
    return FRIENDLY_APP_NAMES[name] || this.capitalize(procName.replace('.exe', ''))
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  private calculatePercentages(
    stats: GlobalRegistry | ProcessRegistry | ApplicationRegistry
  ): void {
    if (stats.totalPackets === 0) return

    stats.ipv4Percent = (stats.ipv4Packets / stats.totalPackets) * 100
    stats.ipv6Percent = (stats.ipv6Packets / stats.totalPackets) * 100
    stats.tcpPercent = (stats.tcpPackets / stats.totalPackets) * 100
    stats.udpPercent = (stats.udpPackets / stats.totalPackets) * 100
  }

  getGlobalRegistry(): Map<string, GlobalRegistry> {
    return this.globalRegistry
  }

  getApplicationRegistries(): Map<string, ApplicationRegistry> {
    return this.applicationRegistries
  }

  getProcessRegistries(): Map<string, ProcessRegistry> {
    return this.processRegistries
  }

  getProcessRegistriesForApp(appName: string): ProcessRegistry[] {
    const appRegistry = this.applicationRegistries.get(appName)
    if (!appRegistry) return []

    return appRegistry.processRegistryIDs
      .map((id) => this.processRegistries.get(id))
      .filter((reg): reg is ProcessRegistry => reg !== undefined)
  }

  async close(): Promise<void> {
    await this.geoService.close()
  }
}
