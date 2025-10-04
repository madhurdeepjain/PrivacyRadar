import { ProcessTracker } from "./process-tracker"
import { ConnectionTracker } from "./connection-tracker"
import { ProcConManager } from "./proc-con-manager"
import { TrafficCapture } from "./traffic-capture"
import { PacketMetadata, NetworkConnection, } from "../interfaces/common"

/* 
  Orchestrates the entire traffic capture/linking process.
  Constructor takes a function, currently one for writing to jsons
*/
export class NetworkAnalyzer {
  private processTracker: ProcessTracker
  private connectionTracker: ConnectionTracker
  private procConManager: ProcConManager
  private trafficCapture: TrafficCapture
  private packetProcessingInt: NodeJS.Timeout | null = null
  private connectionSyncInt: NodeJS.Timeout | null = null
  private onPacketMatched: (pkt: PacketMetadata) => void

  constructor(deviceName: string, localIPs: string[], onPacket: (pkt: PacketMetadata) => void) {
    this.processTracker = new ProcessTracker()
    this.connectionTracker = new ConnectionTracker()
    this.procConManager = new ProcConManager(this.processTracker, this.connectionTracker, localIPs)
    this.trafficCapture = new TrafficCapture(deviceName)
    this.onPacketMatched = onPacket //calls the log function
  }

  async start(): Promise<void> {
    await this.processTracker.startPolling(1000) //poll ps-list
    this.connectionTracker.startPolling(300) //poll netstat

    this.connectionSyncInt = setInterval(() => {
      this.procConManager.updateProcConInfo() //sync map
    }, 1000)

    this.trafficCapture.start()

    this.packetProcessingInt = setInterval(() => {
      //get array of decoded packets
      const packets = this.trafficCapture.flushQueue()
      if (packets.length === 0) return

      //match them with pid + names
      packets.forEach(pkt => this.procConManager.enqueuePacket(pkt))
      const matchedPackets = this.procConManager.flushQueue()

      matchedPackets.forEach(pkt => this.onPacketMatched(pkt)) //write out to log (DB)
    }, 100)
  }

  stop(): void {
    if (this.packetProcessingInt) clearInterval(this.packetProcessingInt)
    if (this.connectionSyncInt) clearInterval(this.connectionSyncInt)
    this.processTracker.stopPolling()
    this.connectionTracker.stopPolling()
    this.trafficCapture.stop()
  }

  getConnections(): NetworkConnection[] {
    return this.procConManager.getConnections()
  }
}