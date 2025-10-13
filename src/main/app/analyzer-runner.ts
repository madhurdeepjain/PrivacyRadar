import { BrowserWindow } from 'electron'
import { join } from 'path'
import { DEV_DATA_PATH, PROC_CON_SNAPSHOT_INTERVAL_MS } from '@config/constants'
import { logger } from '@infra/logging'
import { NetworkAnalyzer } from '@main/core/network/network-analyzer'
import { PacketWriter } from '@main/core/network/packet-writer'
import { getDeviceInfo } from '@shared/utils/device-info'
import { setBestInterfaceInfo } from '@shared/utils/interface-utils'
import { isDevelopment } from '@shared/utils/environment'
import { Device, NetworkInterface, PacketMetadata } from '@shared/interfaces/common'

let analyzer: NetworkAnalyzer | null = null
let writer: PacketWriter | null = null
let snapshotInterval: NodeJS.Timeout | null = null
let mainWindow: BrowserWindow | null = null
let deviceInfoCache: Device | null = null
let selectedInterfaceName: string | null = null
let currentInterfaceName: string | null = null
let interfaceSwitchLock: Promise<void> = Promise.resolve()

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

function sendDataToFrontend(pkt: PacketMetadata): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('network-data', pkt)
  }
}

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

function refreshDeviceInfo(): Device {
  deviceInfoCache = getDeviceInfo()
  setBestInterfaceInfo(deviceInfoCache)

  if (!selectedInterfaceName && deviceInfoCache.bestInterface) {
    selectedInterfaceName = deviceInfoCache.bestInterface.name
  }

  return deviceInfoCache
}

function resolveInterface(deviceInfo: Device, interfaceName?: string): NetworkInterface {
  const requestedName = interfaceName ?? selectedInterfaceName ?? deviceInfo.bestInterface?.name

  if (!requestedName) {
    throw new Error('No suitable network interface found')
  }

  const target = deviceInfo.interfaces.find((iface) => iface.name === requestedName)

  if (!target) {
    throw new Error(`Network interface ${requestedName} not found`)
  }

  selectedInterfaceName = requestedName
  return target
}

export function getInterfaceSelection(): {
  interfaces: NetworkInterface[]
  bestInterfaceName?: string
  selectedInterfaceName?: string
  isCapturing: boolean
} {
  const deviceInfo = refreshDeviceInfo()
  return {
    interfaces: deviceInfo.interfaces,
    bestInterfaceName: deviceInfo.bestInterface?.name,
    selectedInterfaceName:
      currentInterfaceName ?? selectedInterfaceName ?? deviceInfo.bestInterface?.name,
    isCapturing: analyzer !== null
  }
}

export async function startAnalyzer(interfaceName?: string): Promise<void> {
  const deviceInfo = refreshDeviceInfo()
  const selectedInterface = resolveInterface(deviceInfo, interfaceName)

  if (analyzer) {
    logger.debug('Network analyzer already running', { interface: currentInterfaceName })
    return
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

  analyzer = new NetworkAnalyzer(selectedInterface.name, localIPs, (pkt) => {
    writer?.writePacket(pkt)
    sendDataToFrontend(pkt)
  })

  try {
    await analyzer.start()
  } catch (error) {
    writer?.close()
    writer = null
    analyzer = null
    currentInterfaceName = null
    throw error
  }

  currentInterfaceName = selectedInterface.name
  setupPeriodicTasks(analyzer, writer)
  if (!writer) {
    logger.info('Packet persistence disabled (production mode)')
  }
  logger.info('Network analyzer started', { interface: selectedInterface.name })
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
  currentInterfaceName = null
  logger.info('Network analyzer stopped')
}

export async function switchAnalyzerInterface(interfaceName: string): Promise<void> {
  interfaceSwitchLock = interfaceSwitchLock
    .catch(() => undefined)
    .then(async () => {
      const deviceInfo = refreshDeviceInfo()
      const target = deviceInfo.interfaces.find((iface) => iface.name === interfaceName)

      if (!target) {
        throw new Error(`Network interface ${interfaceName} not found`)
      }

      if (currentInterfaceName === interfaceName && analyzer) {
        logger.debug('Requested interface already active', { interface: interfaceName })
        selectedInterfaceName = interfaceName
        return
      }

      const previousSelection = selectedInterfaceName
      selectedInterfaceName = interfaceName

      if (!analyzer) {
        currentInterfaceName = null
        return
      }

      stopAnalyzer()

      try {
        await startAnalyzer(interfaceName)
      } catch (error) {
        selectedInterfaceName = previousSelection
        logger.error('Failed to switch network analyzer interface', {
          interface: interfaceName,
          error
        })
        throw error
      }
    })

  return interfaceSwitchLock
}

export function isAnalyzerRunning(): boolean {
  return analyzer !== null
}
