import { ElectronAPI } from '@electron-toolkit/preload'
import type { PacketMetadata, NetworkInterface, TCCEvent, HardwareStatus, HardwareAccessSummary } from '../main/shared/interfaces/common'

export interface InterfaceSelection {
  interfaces: NetworkInterface[]
  bestInterfaceName?: string
  selectedInterfaceNames: string[]
  isCapturing: boolean
  activeInterfaceNames: string[]
}

export interface API {
  onNetworkData: (callback: (data: PacketMetadata) => void) => void
  removeNetworkDataListener: () => void
  getNetworkInterfaces: () => Promise<InterfaceSelection>
  selectNetworkInterface: (interfaceNames: string[]) => Promise<InterfaceSelection>
  startCapture: () => Promise<InterfaceSelection>
  stopCapture: () => Promise<InterfaceSelection>
  onHardwareStatus: (callback: (status: HardwareStatus) => void) => void
  removeHardwareStatusListener: () => void
  getHardwareStatus: () => Promise<HardwareStatus | null>
  getHardwareSummary: () => Promise<HardwareAccessSummary | null>
}

export interface SystemAPI {
  start: () => Promise<{ success: boolean }>
  stop: () => Promise<{ success: boolean }>
  getActiveSessions: () => Promise<TCCEvent[]>
  isSupported: () => Promise<boolean>
  onEvent: (callback: (event: TCCEvent) => void) => void
  onSessionUpdate: (callback: (event: TCCEvent) => void) => void
  removeAllListeners: () => void
}

export type { PacketMetadata, TCCEvent }

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
    systemAPI: SystemAPI
  }
}
