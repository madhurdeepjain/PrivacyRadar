import {
  PROCESS_POLL_INTERVAL_MS,
  CONNECTION_POLL_INTERVAL_MS,
  CONNECTION_SYNC_INTERVAL_MS,
  PACKET_PROCESS_INTERVAL_MS
} from '@config/constants'
import { PacketMetadata, NetworkConnection } from '@shared/interfaces/common'
import { ProcessTracker } from '@main/core/network/process-tracker'
import { ConnectionTracker } from '@main/core/network/connection-tracker'
import { ProcConManager } from '@main/core/network/proc-con-manager'
import { TrafficCapture } from '@main/core/network/traffic-capture'

/**
 * Orchestrates process tracking, connection tracking, packet capture and matching.
 * Accepts a callback for consumers to handle matched packets (e.g. persistence).
 */
export class NetworkAnalyzer {
  private readonly processTracker: ProcessTracker
  private readonly connectionTracker: ConnectionTracker
  private readonly procConManager: ProcConManager
  private readonly trafficCapture: TrafficCapture
  private packetProcessingTimer: NodeJS.Timeout | null = null
  private connectionSyncTimer: NodeJS.Timeout | null = null
  private readonly onPacketMatched: (pkt: PacketMetadata[]) => void

  constructor(deviceName: string, localIPs: string[], onPacket: (pkt: PacketMetadata[]) => void) {
    this.processTracker = new ProcessTracker()
    this.connectionTracker = new ConnectionTracker()
    this.procConManager = new ProcConManager(this.processTracker, this.connectionTracker, localIPs)
    this.trafficCapture = new TrafficCapture(deviceName)
    this.onPacketMatched = onPacket
  }

  async start(): Promise<void> {
    await this.processTracker.startPolling(PROCESS_POLL_INTERVAL_MS)
    this.connectionTracker.startPolling(CONNECTION_POLL_INTERVAL_MS)

    this.connectionSyncTimer = setInterval(() => {
      this.procConManager.updateProcConInfo()
    }, CONNECTION_SYNC_INTERVAL_MS)

    this.trafficCapture.start()

    this.packetProcessingTimer = setInterval(() => {
      const packets = this.trafficCapture.flushQueue()
      if (packets.length === 0) return

      packets.forEach((pkt) => this.procConManager.enqueuePacket(pkt))
      const matchedPackets = this.procConManager.flushQueue()

      if (matchedPackets.length > 0) this.onPacketMatched(matchedPackets)
    }, PACKET_PROCESS_INTERVAL_MS)
  }

  stop(): void {
    if (this.packetProcessingTimer) clearInterval(this.packetProcessingTimer)
    if (this.connectionSyncTimer) clearInterval(this.connectionSyncTimer)
    this.processTracker.stopPolling()
    this.connectionTracker.stopPolling()
    this.trafficCapture.stop()
  }

  getConnections(): NetworkConnection[] {
    return this.procConManager.getConnections()
  }
}
