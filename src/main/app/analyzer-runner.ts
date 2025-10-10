import { BrowserWindow } from 'electron'
import { join } from 'path'
import { DEV_DATA_PATH, PROC_CON_SNAPSHOT_INTERVAL_MS } from '@config/constants'
import { logger } from '@infra/logging'
import { NetworkAnalyzer } from '@main/core/network/network-analyzer'
import { PacketWriter } from '@main/core/network/packet-writer'
import { getDeviceInfo } from '@shared/utils/device-info'
import { setBestInterfaceInfo } from '@shared/utils/interface-utils'
import { isDevelopment } from '@shared/utils/environment'
import { PacketMetadata } from '@shared/interfaces/common'

let analyzer: NetworkAnalyzer | null = null
let writer: PacketWriter | null = null
let snapshotInterval: NodeJS.Timeout | null = null
let mainWindow: BrowserWindow | null = null

function setupPeriodicTasks(
  networkAnalyzer: NetworkAnalyzer,
  packetWriter: PacketWriter | null
): void {
  if (snapshotInterval) clearInterval(snapshotInterval)
  snapshotInterval = null

  if (!packetWriter) {
    return
  }

  snapshotInterval = setInterval(() => {
    packetWriter.writeProcConSnapshot(networkAnalyzer.getConnections())
  }, PROC_CON_SNAPSHOT_INTERVAL_MS)
}

function sendDataToFrontend(pkts: PacketMetadata[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('network-data', pkts)
  }
}

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

export async function startAnalyzer(): Promise<void> {
  if (analyzer) {
    logger.debug('Network analyzer already running')
    return
  }

  const deviceInfo = getDeviceInfo()
  setBestInterfaceInfo(deviceInfo)

  if (!deviceInfo.bestInterface) {
    throw new Error('No suitable network interface found')
  }

  const localIPs = deviceInfo.interfaces
    .flatMap((iface) => iface.addresses)
    .filter((addr) => addr && addr !== '0.0.0.0' && addr !== '::')

  if (isDevelopment()) {
    const basePath = join(DEV_DATA_PATH, 'packets')
    writer = new PacketWriter(basePath)
  } else {
    writer = null
  }

  analyzer = new NetworkAnalyzer(deviceInfo.bestInterface.name, localIPs, (pkts) => {
    pkts.forEach(pkt => writer?.writePacket(pkt))
    sendDataToFrontend(pkts)
  })

  try {
    await analyzer.start()
  } catch (error) {
    writer?.close()
    writer = null
    analyzer = null
    throw error
  }

  setupPeriodicTasks(analyzer, writer)
  if (!writer) {
    logger.info('Packet persistence disabled (production mode)')
  }
  logger.info('Network analyzer started', { interface: deviceInfo.bestInterface.name })
}

export function stopAnalyzer(): void {
  if (!analyzer && !writer) {
    return
  }

  if (snapshotInterval) clearInterval(snapshotInterval)
  snapshotInterval = null
  writer?.close()
  analyzer?.stop()
  writer = null
  analyzer = null
  logger.info('Network analyzer stopped')
}
