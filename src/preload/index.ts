import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { API, InterfaceSelection, SystemAPI } from './preload'
import type {
  ApplicationRegistry,
  GeoLocationData,
  GlobalRegistry,
  PacketMetadata,
  ProcessRegistry,
  TCCEvent
} from '../main/shared/interfaces/common'

const api: API = {
  onNetworkData: (callback: (data: PacketMetadata) => void) => {
    ipcRenderer.on('network-data', (_event, data) => {
      if (data) {
        callback(data)
      }
    })
  },
  onApplicationRegistryData: (callback: (data: Map<string, ApplicationRegistry>) => void) => {
    ipcRenderer.on('application-registry-data', (_event, data) => {
      if (data) {
        callback(data)
      }
    })
  },
  onProcessRegistryData: (callback: (data: Map<string, ProcessRegistry>) => void) => {
    ipcRenderer.on('process-registry-data', (_event, data) => {
      if (data) {
        callback(data)
      }
    })
  },
  onGlobalRegistryData: (callback: (data: Map<string, GlobalRegistry>) => void) => {
    ipcRenderer.on('global-registry-data', (_event, data) => {
      if (data) {
        callback(data)
      }
    })
  },
  removeNetworkDataListener: () => {
    ipcRenderer.removeAllListeners('network-data')
  },
  getNetworkInterfaces: async (): Promise<InterfaceSelection> => {
    return ipcRenderer.invoke('network:getInterfaces')
  },
  selectNetworkInterface: async (interfaceNames: string[]): Promise<InterfaceSelection> => {
    return ipcRenderer.invoke('network:selectInterface', interfaceNames)
  },
  startCapture: async (): Promise<InterfaceSelection> => {
    return ipcRenderer.invoke('network:startCapture')
  },
  stopCapture: async (): Promise<InterfaceSelection> => {
    return ipcRenderer.invoke('network:stopCapture')
  },
  queryDatabase: async (options: {
    table: 'global_snapshots' | 'application_snapshots' | 'process_snapshots'
    limit?: number
    offset?: number
  }): Promise<[unknown[], string]> => {
    return ipcRenderer.invoke('network:queryDatabase', options)
  },
  setValue: async (key: string, value: string): Promise<void> => {
    return ipcRenderer.invoke('set-value', key, value)
  },
  getValue: async (key: string): Promise<string> => {
    return ipcRenderer.invoke('get-value', key)
  },
  getGeoLocation: async (ip: string): Promise<GeoLocationData> => {
    return ipcRenderer.invoke('network:getGeoLocation', ip)
  },
  getPublicIP: async (): Promise<string> => {
    return ipcRenderer.invoke('network:getPublicIP')
  }
}

const systemAPI: SystemAPI = {
  start: () => ipcRenderer.invoke('system:start'),
  stop: () => ipcRenderer.invoke('system:stop'),
  getActiveSessions: () => ipcRenderer.invoke('system:get-active-sessions'),
  isSupported: () => ipcRenderer.invoke('system:is-supported'),
  onEvent: (callback: (event: TCCEvent) => void) => {
    ipcRenderer.on('system-event', (_event, data) => callback(data))
  },
  onSessionUpdate: (callback: (event: TCCEvent) => void) => {
    ipcRenderer.on('system-session-update', (_event, data) => callback(data))
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('system-event')
    ipcRenderer.removeAllListeners('system-session-update')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('systemAPI', systemAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  ;(
    window as Window & {
      electron: typeof electronAPI
      api: typeof api
      systemAPI: typeof systemAPI
    }
  ).electron = electronAPI
  ;(
    window as Window & {
      electron: typeof electronAPI
      api: typeof api
      systemAPI: typeof systemAPI
    }
  ).api = api
  ;(
    window as Window & {
      electron: typeof electronAPI
      api: typeof api
      systemAPI: typeof systemAPI
    }
  ).systemAPI = systemAPI
}
