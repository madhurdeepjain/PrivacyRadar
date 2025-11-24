import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { API, InterfaceSelection, SystemAPI } from './preload'
import type { PacketMetadata, TCCEvent } from '../main/shared/interfaces/common'

// Custom APIs for renderer
const api: API = {
  onNetworkData: (callback: (data: PacketMetadata) => void) => {
    ipcRenderer.on('network-data', (_event, data) => callback(data))
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
  }
}

// System Monitoring API
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

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('systemAPI', systemAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.systemAPI = systemAPI
}
