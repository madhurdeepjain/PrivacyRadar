import { BrowserWindow } from 'electron'
import { join } from 'path'
import {
  DEV_DATA_PATH,
  PROC_CON_SNAPSHOT_INTERVAL_MS,
  REGISTRY_SNAPSHOT_INTERVAL_MS
} from '@config/constants'
import { logger } from '@infra/logging'
import { NetworkAnalyzer } from '@main/core/network/network-analyzer'
import { PacketWriter } from '@main/core/network/packet-writer'
import { RegistryWriter } from '@main/core/network/registry-writer'
import { getDeviceInfo } from '@shared/utils/device-info'
import { setBestInterfaceInfo } from '@shared/utils/interface-utils'
import { isDevelopment } from '@shared/utils/environment'
import { Device, NetworkInterface, PacketMetadata } from '@shared/interfaces/common'
import { formatIPv6Address } from '@main/shared/utils/address-normalizer'

let analyzer: NetworkAnalyzer | null = null
let writer: PacketWriter | null = null
let registryWriter: RegistryWriter | null = null
let snapshotInterval: NodeJS.Timeout | null = null
let registrySnapshotInterval: NodeJS.Timeout | null = null
let mainWindow: BrowserWindow | null = null
let deviceInfoCache: Device | null = null
let selectedInterfaceNames: string[] = []
let activeInterfaceNames: string[] = []
let interfaceSwitchLock: Promise<void> = Promise.resolve()

function setupPeriodicTasks(
  networkAnalyzer: NetworkAnalyzer,
  packetWriter: PacketWriter | null,
  regWriter: RegistryWriter | null
): void {
  if (snapshotInterval) clearInterval(snapshotInterval)
  snapshotInterval = null
  if (registrySnapshotInterval) clearInterval(registrySnapshotInterval)
  registrySnapshotInterval = null

  if (packetWriter) {
    snapshotInterval = setInterval(() => {
      packetWriter.writeProcConSnapshot(networkAnalyzer.getConnections())
    }, PROC_CON_SNAPSHOT_INTERVAL_MS)
  }

  if (regWriter) {
    registrySnapshotInterval = setInterval(() => {
      const globalReg = networkAnalyzer.getGlobalRegistry()
      const appRegs = networkAnalyzer.getApplicationRegistries()
      const procRegs = networkAnalyzer.getProcessRegistries()
      regWriter.writeRegistries(globalReg, appRegs, procRegs)
    }, REGISTRY_SNAPSHOT_INTERVAL_MS)
  }
}

function sendDataToFrontend(pkt: PacketMetadata): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('network-data', pkt)
  }
}

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

function ensureSelectionInSync(deviceInfo: Device): void {
  const availableNames = new Set(deviceInfo.interfaces.map((iface) => iface.name))
  const filtered = selectedInterfaceNames.filter((name) => availableNames.has(name))

  if (filtered.length === 0 && deviceInfo.interfaces.length > 0) {
    selectedInterfaceNames = deviceInfo.interfaces.map((iface) => iface.name)
    return
  }

  if (filtered.length !== selectedInterfaceNames.length) {
    selectedInterfaceNames = filtered
  }
}

function applySelectedInterfaces(deviceInfo: Device, interfaceNames?: string[]): void {
  const availableNames = new Set(deviceInfo.interfaces.map((iface) => iface.name))

  if (!interfaceNames || interfaceNames.length === 0) {
    selectedInterfaceNames = deviceInfo.interfaces.map((iface) => iface.name)
    return
  }

  const normalized: string[] = []

  interfaceNames.forEach((name) => {
    if (!availableNames.has(name)) {
      return
    }

    if (!normalized.includes(name)) {
      normalized.push(name)
    }
  })

  if (normalized.length === 0) {
    throw new Error('No valid network interfaces selected')
  }

  selectedInterfaceNames = normalized
}

function refreshDeviceInfo(): Device {
  deviceInfoCache = getDeviceInfo()
  setBestInterfaceInfo(deviceInfoCache)
  ensureSelectionInSync(deviceInfoCache)

  return deviceInfoCache
}

function getInterfacesForCapture(deviceInfo: Device): NetworkInterface[] {
  const selectedSet = new Set(selectedInterfaceNames)
  const matches = deviceInfo.interfaces.filter((iface) => selectedSet.has(iface.name))

  if (matches.length === 0) {
    throw new Error('No suitable network interface found')
  }

  return matches
}

export function getInterfaceSelection(): {
  interfaces: NetworkInterface[]
  bestInterfaceName?: string
  selectedInterfaceNames: string[]
  isCapturing: boolean
  activeInterfaceNames: string[]
} {
  const deviceInfo = refreshDeviceInfo()

  return {
    interfaces: deviceInfo.interfaces,
    bestInterfaceName: deviceInfo.bestInterface?.name,
    selectedInterfaceNames: [...selectedInterfaceNames],
    isCapturing: analyzer !== null,
    activeInterfaceNames: [...activeInterfaceNames]
  }
}

export async function startAnalyzer(interfaceNames?: string | string[]): Promise<void> {
  const deviceInfo = refreshDeviceInfo()
  deviceInfo.interfaces.forEach((iface) => {
    iface.addresses = iface.addresses.map((addr) => formatIPv6Address(addr))
  })
  if (Array.isArray(interfaceNames)) {
    applySelectedInterfaces(deviceInfo, interfaceNames)
  } else if (interfaceNames) {
    applySelectedInterfaces(deviceInfo, [interfaceNames])
  } else {
    ensureSelectionInSync(deviceInfo)
  }

  if (analyzer) {
    logger.debug('Network analyzer already running', { interfaces: activeInterfaceNames })
    return
  }

  const interfacesToCapture = getInterfacesForCapture(deviceInfo)
  const interfaceNamesToCapture = interfacesToCapture.map((iface) => iface.name)

  const localIPs = deviceInfo.interfaces
    .flatMap((iface) => iface.addresses)
    .filter((addr) => addr && addr !== '0.0.0.0' && addr !== '::')

  if (isDevelopment()) {
    const basePath = join(DEV_DATA_PATH, 'packets')
    writer = new PacketWriter(basePath)
    registryWriter = new RegistryWriter(basePath)
  } else {
    writer = null
  }

  analyzer = new NetworkAnalyzer(
    interfaceNamesToCapture.length === 1 ? interfaceNamesToCapture[0] : interfaceNamesToCapture,
    localIPs,
    (pkt) => {
      writer?.writePacket(pkt)
      sendDataToFrontend(pkt)
    }
  )

  try {
    await analyzer.start()
  } catch (error) {
    writer?.close()
    registryWriter?.close()
    writer = null
    registryWriter = null
    analyzer = null
    activeInterfaceNames = []
    throw error
  }

  activeInterfaceNames = interfaceNamesToCapture
  setupPeriodicTasks(analyzer, writer, registryWriter)
  if (!writer) {
    logger.info('Packet persistence disabled (production mode)')
  }
  logger.info('Network analyzer started', { interfaces: interfaceNamesToCapture })
}

export function stopAnalyzer(): void {
  if (!analyzer && !writer && !registryWriter) {
    return
  }

  if (snapshotInterval) clearInterval(snapshotInterval)
  snapshotInterval = null
  if (registrySnapshotInterval) clearInterval(registrySnapshotInterval)
  registrySnapshotInterval = null

  writer?.close()
  registryWriter?.close()
  analyzer?.stop()
  writer = null
  registryWriter = null
  analyzer = null
  activeInterfaceNames = []
  logger.info('Network analyzer stopped')
}

export async function updateAnalyzerInterfaces(interfaceNames: string[] = []): Promise<void> {
  interfaceSwitchLock = interfaceSwitchLock
    .catch(() => undefined)
    .then(async () => {
      const deviceInfo = refreshDeviceInfo()
      const wasRunning = analyzer !== null
      const previousSelection = [...selectedInterfaceNames]
      const previousActive = [...activeInterfaceNames]

      applySelectedInterfaces(deviceInfo, interfaceNames)

      const previousSet = new Set(previousSelection)
      const currentSet = new Set(selectedInterfaceNames)
      const selectionChanged =
        previousSet.size !== currentSet.size ||
        selectedInterfaceNames.some((name) => !previousSet.has(name))

      if (!selectionChanged) {
        if (!wasRunning) {
          activeInterfaceNames = []
        }
        return
      }

      if (!wasRunning) {
        activeInterfaceNames = []
        return
      }

      stopAnalyzer()

      try {
        await startAnalyzer()
      } catch (error) {
        selectedInterfaceNames = previousSelection
        activeInterfaceNames = previousActive
        logger.error('Failed to update network analyzer interface selection', {
          interfaces: interfaceNames,
          error
        })

        try {
          await startAnalyzer()
        } catch (restoreError) {
          logger.error('Failed to restore previous network analyzer interface selection', {
            interfaces: previousSelection,
            error: restoreError
          })
        }

        throw error
      }
    })

  return interfaceSwitchLock
}

export function isAnalyzerRunning(): boolean {
  return analyzer !== null
}
