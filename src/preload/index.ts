import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { API, InterfaceSelection } from './preload'
import type { PacketMetadata } from '../main/shared/interfaces/common'

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

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

// Types for AI result.
interface AiSessionInsight {
  narrativeSummary: string
  topRisks: {
    appName: string
    overallRisk: 'low' | 'medium' | 'high'
    categories: string[]
    explanation: string
  }[]
}

// Sujal: expose AI bridge to renderer.
contextBridge.exposeInMainWorld('privacyAI', {
  explainSession: async (timeWindowMinutes?: number): Promise<AiSessionInsight> => {
    return ipcRenderer.invoke('ai:explain-session', timeWindowMinutes)
  }
})
