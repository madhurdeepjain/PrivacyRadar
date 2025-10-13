import { ElectronAPI } from '@electron-toolkit/preload'
import type { PacketMetadata, NetworkInterface } from '../main/shared/interfaces/common'

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
}

export type { PacketMetadata }

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
