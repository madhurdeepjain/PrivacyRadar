import { vi } from 'vitest'
import type { BrowserWindow } from 'electron'

export function createMockBrowserWindow(): BrowserWindow {
  return {
    id: 1,
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn()
    },
    on: vi.fn(),
    once: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(),
    loadFile: vi.fn()
  } as unknown as BrowserWindow
}

export function createMockIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    handlers: {
      get: (channel: string) => handlers.get(channel),
      has: (channel: string) => handlers.has(channel),
      clear: () => handlers.clear()
    }
  }
}

export function createMockApp() {
  return {
    whenReady: vi.fn(() => Promise.resolve()),
    getPath: vi.fn((name: string) => name === 'userData' ? '/tmp/test-user-data' : '/tmp/test-path'),
    getAppPath: vi.fn(() => '/tmp/test-app-path'),
    quit: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn()
  }
}

