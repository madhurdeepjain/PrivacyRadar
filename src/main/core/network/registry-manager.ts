import {
  ApplicationRegistry,
  GlobalRegistry,
  PacketMetadata,
  ProcessRegistry,
  ProcDetails,
  EmptyStats
} from '@shared/interfaces/common'
import { ProcessTracker } from './process-tracker'
import { ConnectionTracker } from './connection-tracker'
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

  constructor(
    private readonly processTracker: ProcessTracker,
    private readonly connectionTracker: ConnectionTracker,
    localIPs: string[]
  ) {
    this.localIPs = new Set(localIPs)
  }

  processPacket(pkt: PacketMetadata): void {
    this.updateGlobalStats(pkt)

    if (pkt.procName === 'SYSTEM' || pkt.pid === -1) {
      this.tagPacket(pkt, 'system', 'System', 'System')
      return
    }

    if (!pkt.pid || pkt.procName?.startsWith('UNKNOWN')) {
      this.tagPacket(pkt, 'unknown', 'Unknown', 'Unknown')
      return
    }

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
        totalPackets: emptyStats.totalPackets,
        totalBytesSent: emptyStats.totalBytesSent,
        totalBytesReceived: emptyStats.totalBytesReceived,
        ipv4Packets: emptyStats.ipv4Packets,
        ipv6Packets: emptyStats.ipv6Packets,
        tcpPackets: emptyStats.tcpPackets,
        udpPackets: emptyStats.udpPackets,
        ipv4Percent: emptyStats.ipv4Percent,
        ipv6Percent: emptyStats.ipv6Percent,
        tcpPercent: emptyStats.tcpPercent,
        udpPercent: emptyStats.udpPercent,
        inboundBytes: emptyStats.inboundBytes,
        outboundBytes: emptyStats.outboundBytes,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      })
    }
    const global = this.globalRegistry.get(interfaceName)!
    this.updateStats(global, pkt)
  }

  private resolveProcessRegistry(pkt: PacketMetadata): ProcessRegistry {
    const pid = pkt.pid!
    const registryId = this.generateRegistryId(pid)

    if (this.processRegistries.has(registryId)) {
      return this.processRegistries.get(registryId)!
    }

    const proc = this.getProcessFromConnection(pkt) || this.processTracker.getProcess(pid)

    if (!proc) {
      return this.createFallbackProcessRegistry(pid, pkt.procName || 'Unknown')
    }

    const rootPID = this.processTracker.findRootParent(pid)
    const rootProc = this.processTracker.getProcess(rootPID)
    const appName = rootProc ? this.getFriendlyName(rootProc.name) : this.getFriendlyName(proc.name)

    const processRegistry = this.createProcessRegistry(registryId, appName, proc)
    this.processRegistries.set(registryId, processRegistry)
    this.addProcessRegistryToApp(appName, registryId)

    logger.debug(`Created ProcessRegistry: ${registryId}`, {
      pid,
      appName,
      isIPv6: this.isIPv6(pkt)
    })
    return processRegistry
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

  private generateRegistryId(pid: number): string {
    const proc = this.processTracker.getProcess(pid)
    if (!proc) return `unknown-${pid}`

    const rootPID = this.processTracker.findRootParent(pid)
    const rootProc = this.processTracker.getProcess(rootPID)
    const appName = rootProc ? this.getFriendlyName(rootProc.name) : 'unknown'

    return `${appName.toLowerCase().replace(/\s+/g, '-')}-${pid}`
  }

  private createProcessRegistry(id: string, appName: string, proc: ProcDetails): ProcessRegistry {
    const emptyStats = createEmptyStats()
    return {
      id,
      appName,
      pid: proc.pid,
      parentPID: proc.ppid || 0,
      procName: proc.name,
      exePath: proc.cmd,
      isRootProcess: (proc.ppid || 0) === 0,
      totalPackets: emptyStats.totalPackets,
      totalBytesSent: emptyStats.totalBytesSent,
      totalBytesReceived: emptyStats.totalBytesReceived,
      inboundBytes: emptyStats.inboundBytes,
      outboundBytes: emptyStats.outboundBytes,
      ipv4Packets: emptyStats.ipv4Packets,
      ipv6Packets: emptyStats.ipv6Packets,
      tcpPackets: emptyStats.tcpPackets,
      udpPackets: emptyStats.udpPackets,
      ipv4Percent: emptyStats.ipv4Percent,
      ipv6Percent: emptyStats.ipv6Percent,
      tcpPercent: emptyStats.tcpPercent,
      udpPercent: emptyStats.udpPercent,
      uniqueRemoteIPs: new Set(),
      //geoLocations: [],
      interfaceStats: new Map(),
      firstSeen: Date.now(),
      lastSeen: Date.now()
    }
  }

  private createFallbackProcessRegistry(pid: number, procName: string): ProcessRegistry {
    const id = `unknown-${pid}`
    const appName = procName || 'Unknown'
    const emptyStats = createEmptyStats()

    const registry: ProcessRegistry = {
      id,
      appName,
      pid,
      parentPID: 0,
      procName,
      isRootProcess: true,
      totalPackets: emptyStats.totalPackets,
      totalBytesSent: emptyStats.totalBytesSent,
      totalBytesReceived: emptyStats.totalBytesReceived,
      inboundBytes: emptyStats.inboundBytes,
      outboundBytes: emptyStats.outboundBytes,
      ipv4Packets: emptyStats.ipv4Packets,
      ipv6Packets: emptyStats.ipv6Packets,
      tcpPackets: emptyStats.tcpPackets,
      udpPackets: emptyStats.udpPackets,
      ipv4Percent: emptyStats.ipv4Percent,
      ipv6Percent: emptyStats.ipv6Percent,
      tcpPercent: emptyStats.tcpPercent,
      udpPercent: emptyStats.udpPercent,
      uniqueRemoteIPs: new Set(),
      //geoLocations: [],
      interfaceStats: new Map(),
      firstSeen: Date.now(),
      lastSeen: Date.now()
    }
    this.processRegistries.set(id, registry)
    this.addProcessRegistryToApp(appName, id)
    return registry
  }

  private addProcessRegistryToApp(appName: string, processRegistryId: string): void {
    if (!this.applicationRegistries.has(appName)) {
      const emptyStats = createEmptyStats()
      this.applicationRegistries.set(appName, {
        appName,
        appDisplayName: appName,
        totalPackets: emptyStats.totalPackets,
        totalBytesSent: emptyStats.totalBytesSent,
        totalBytesReceived: emptyStats.totalBytesReceived,
        inboundBytes: emptyStats.inboundBytes,
        outboundBytes: emptyStats.outboundBytes,
        ipv4Packets: emptyStats.ipv4Packets,
        ipv6Packets: emptyStats.ipv6Packets,
        tcpPackets: emptyStats.tcpPackets,
        udpPackets: emptyStats.udpPackets,
        ipv4Percent: emptyStats.ipv4Percent,
        ipv6Percent: emptyStats.ipv6Percent,
        tcpPercent: emptyStats.tcpPercent,
        udpPercent: emptyStats.udpPercent,
        uniqueRemoteIPs: new Set(),
        uniqueDomains: new Set(),
        //geoLocations: [],
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
}
