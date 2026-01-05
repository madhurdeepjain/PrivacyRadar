import { ElectronAPI } from '@electron-toolkit/preload'
import type { PacketMetadata, NetworkInterface, TCCEvent } from '../main/shared/interfaces/common'

export interface InterfaceSelection {
  interfaces: NetworkInterface[]
  bestInterfaceName?: string
  selectedInterfaceNames: string[]
  isCapturing: boolean
  activeInterfaceNames: string[]
}

export interface API {
  onApplicationRegistryData: (callback: (data: Map<string, ApplicationRegistry>) => void) => void
  onProcessRegistryData: (callback: (data: Map<string, ProcessRegistry>) => void) => void
  onGlobalRegistryData: (callback: (data: Map<string, GlobalRegistry>) => void) => void
  onNetworkData: (callback: (data: PacketMetadata) => void) => void
  removeNetworkDataListener: () => void
  getNetworkInterfaces: () => Promise<InterfaceSelection>
  selectNetworkInterface: (interfaceNames: string[]) => Promise<InterfaceSelection>
  startCapture: () => Promise<InterfaceSelection>
  stopCapture: () => Promise<InterfaceSelection>
  queryDatabase: (sql: string) => Promise<[unknown[], string]>
  setValue: (key: string, value: string) => Promise<void>
  getValue: (key: string) => Promise<string>
  getGeoLocation: (ip: string) => Promise<GeoLocationData>
  getPrivacySummary: (snapshot: unknown) => Promise<unknown>
  getPublicIP: () => Promise<string>
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
