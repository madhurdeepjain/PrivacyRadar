import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import type { API } from '../src/preload/preload'

if (typeof window !== 'undefined') {
  const versions = {
    electron: '0.0.0-test',
    chrome: '0.0.0-test',
    node: process.version.replace('v', '')
  }

  Object.defineProperty(window, 'electron', {
    value: {
      process: {
        versions
      }
    } as unknown as Window['electron'],
    writable: true
  })

  const apiStub: API = {
    onApplicationRegistryData: vi.fn(),
    onProcessRegistryData: vi.fn(),
    onGlobalRegistryData: vi.fn(),
    onNetworkData: vi.fn(),
    removeNetworkDataListener: vi.fn(),
    getNetworkInterfaces: vi.fn(),
    selectNetworkInterface: vi.fn(),
    startCapture: vi.fn(),
    stopCapture: vi.fn(),
    queryDatabase: vi.fn(),
    setValue: vi.fn(),
    getValue: vi.fn(),
    getGeoLocation: vi.fn(),
    getPublicIP: vi.fn()
  }

  Object.defineProperty(window, 'api', {
    value: apiStub,
    writable: true
  })

  Object.defineProperty(window, 'systemAPI', {
    value: {
      onEvent: vi.fn(),
      onSessionUpdate: vi.fn(),
      removeAllListeners: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getActiveSessions: vi.fn().mockResolvedValue([])
    },
    writable: true,
    configurable: true
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})
