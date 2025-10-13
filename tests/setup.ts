import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import type { API } from '../src/preload/preload'

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

beforeEach(() => {
  vi.restoreAllMocks()
})
