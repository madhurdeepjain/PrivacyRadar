import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as bootstrap from '../../../src/main/app/bootstrap'

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
      getPath: vi.fn((name: string) =>
        name === 'userData' ? '/tmp/test-user-data' : '/tmp/test-path'
      ),
      getAppPath: vi.fn(() => '/tmp/test-app-path'),
      quit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn()
    },
    BrowserWindow: vi.fn(() => ({
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
  setMainWindow: vi.fn(),
  setSharedProcessTracker: vi.fn()
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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('completes bootstrap sequence', async () => {
    await bootstrap.startApp()

    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain
    const { getDatabase } = await import('@infra/db')
    const { createMainWindow } = await import('@main/app/window-manager')
    const { createSystemMonitor } = await import('@core/system/system-monitor-factory')

    expect(mockIpc.handlers.has('network:getInterfaces')).toBe(true)
    expect(getDatabase).toHaveBeenCalled()
    expect(createMainWindow).toHaveBeenCalled()
    expect(createSystemMonitor).toHaveBeenCalled()

    const getInterfacesHandler = mockIpc.handlers.get('network:getInterfaces')
    expect(getInterfacesHandler).toBeDefined()
    const result = await getInterfacesHandler!()
    expect(result).toHaveProperty('interfaces')
    expect(result).toHaveProperty('isCapturing')
    expect(result).toHaveProperty('selectedInterfaceNames')
    expect(Array.isArray(result.interfaces)).toBe(true)
  })

  it('registers IPC handlers during bootstrap', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain
    expect(mockIpc.handlers.has('network:getInterfaces')).toBe(true)
    expect(mockIpc.handlers.has('system:start')).toBe(true)

    const systemStartHandler = mockIpc.handlers.get('system:start')
    expect(systemStartHandler).toBeDefined()
    const startResult = await systemStartHandler!()
    expect(startResult).toEqual({ success: true })

    const isSupportedHandler = mockIpc.handlers.get('system:is-supported')
    expect(isSupportedHandler).toBeDefined()
    const isSupported = await isSupportedHandler!()
    expect(isSupported).toBe(true)
  })
})
