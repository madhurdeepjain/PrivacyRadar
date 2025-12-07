import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as bootstrap from '../../../src/main/app/bootstrap'

// Create mocks inline in hoisted scope to avoid import issues
const mockHelpers = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      handlers: {
        get: (channel: string) => handlers.get(channel),
        has: (channel: string) => handlers.has(channel),
        clear: () => handlers.clear()
      }
    },
    app: {
      whenReady: vi.fn(() => Promise.resolve()),
      getPath: vi.fn((name: string) => name === 'userData' ? '/tmp/test-user-data' : '/tmp/test-path'),
      getAppPath: vi.fn(() => '/tmp/test-app-path'),
      quit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn()
    },
    BrowserWindow: vi.fn(() => ({
      id: 1,
      webContents: { send: vi.fn(), on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), removeAllListeners: vi.fn() },
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
    }))
  }
})

vi.mock('electron', () => ({
  __esModule: true,
  default: mockHelpers,
  ...mockHelpers
}))

vi.mock('@infra/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }
}))

vi.mock('@infra/db', () => ({
  getDatabase: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => [])
    }))
  })),
  runMigrations: vi.fn()
}))

vi.mock('@infra/db/migrate', () => ({
  runMigrations: vi.fn()
}))

vi.mock('@main/app/analyzer-runner', () => ({
  getInterfaceSelection: vi.fn(() => ({
    interfaces: [],
    selectedInterfaceNames: [],
    isCapturing: false,
    activeInterfaceNames: []
  })),
  startAnalyzer: vi.fn(() => Promise.resolve()),
  stopAnalyzer: vi.fn(),
  updateAnalyzerInterfaces: vi.fn(() => Promise.resolve()),
  setMainWindow: vi.fn()
}))

vi.mock('@core/system/system-monitor-factory', () => ({
  createSystemMonitor: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getActiveSessions: vi.fn(() => []),
    isRunning: vi.fn(() => false)
  })),
  isSystemMonitoringSupported: vi.fn(() => true)
}))

vi.mock('@electron-toolkit/utils', () => ({
  electronApp: {
    setAppUserModelId: vi.fn()
  }
}))

vi.mock('@main/app/lifecycle', () => ({
  registerAppLifecycleHandlers: vi.fn(),
  registerProcessSignalHandlers: vi.fn()
}))

vi.mock('@main/app/window-manager', () => ({
  createMainWindow: vi.fn(() => mockHelpers.BrowserWindow())
}))

describe('Application Bootstrap Integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('completes bootstrap sequence', async () => {
    await expect(bootstrap.startApp()).resolves.not.toThrow()
  })

  it('registers IPC handlers during bootstrap', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain
    expect(mockIpc.handlers.has('network:getInterfaces')).toBe(true)
    expect(mockIpc.handlers.has('system:start')).toBe(true)
  })

  it('initializes database during bootstrap', async () => {
    await bootstrap.startApp()

    const { getDatabase } = await import('@infra/db')
    expect(getDatabase).toHaveBeenCalled()
  })

  it('creates main window during bootstrap', async () => {
    await bootstrap.startApp()

    const { createMainWindow } = await import('@main/app/window-manager')
    expect(createMainWindow).toHaveBeenCalled()
  })

  it('initializes system monitor during bootstrap', async () => {
    await bootstrap.startApp()

    const { createSystemMonitor } = await import('@core/system/system-monitor-factory')
    expect(createSystemMonitor).toHaveBeenCalled()
  })
})

