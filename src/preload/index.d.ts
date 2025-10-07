import { ElectronAPI } from '@electron-toolkit/preload'
import type { PacketMetadata } from '../main/shared/interfaces/common'

export interface API {
  onNetworkData: (callback: (data: PacketMetadata) => void) => void
  removeNetworkDataListener: () => void
}

export type { PacketMetadata }

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
