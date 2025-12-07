import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import type { API } from '../src/preload/preload'

// Only setup window mocks if we're in a browser-like environment (jsdom)
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
    onNetworkData: vi.fn(),
    removeNetworkDataListener: vi.fn(),
    getNetworkInterfaces: vi.fn(),
    selectNetworkInterface: vi.fn()
  }

  Object.defineProperty(window, 'api', {
    value: apiStub,
    writable: true
  })

  // Mock systemAPI for SystemMonitor component
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
