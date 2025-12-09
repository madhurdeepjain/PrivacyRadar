import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as bootstrap from '../../../src/main/app/bootstrap'

const mockHelpers = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const eventListeners = new Set<(event: unknown) => void>()
  const sessionUpdateListeners = new Set<(event: unknown) => void>()
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
        send: vi.fn((channel: string, data: unknown) => {
          if (channel === 'system:event') {
            eventListeners.forEach((listener) => listener(data))
          } else if (channel === 'system:session-update') {
            sessionUpdateListeners.forEach((listener) => listener(data))
          }
        }),
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
    })),
    eventListeners,
    sessionUpdateListeners
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
  }))
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

const mockSystemMonitor = {
  start: vi.fn(),
  stop: vi.fn(),
  getActiveSessions: vi.fn(() => []),
  isRunning: vi.fn(() => false)
}

vi.mock('@core/system/system-monitor-factory', () => ({
  createSystemMonitor: vi.fn(() => mockSystemMonitor),
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

describe('System Monitor Events Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockSystemMonitor.getActiveSessions.mockReturnValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('registers event listener during bootstrap', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

    expect(mockIpc.handlers.has('system:start')).toBe(true)
    expect(mockIpc.handlers.has('system:stop')).toBe(true)
    expect(mockIpc.handlers.has('system:get-active-sessions')).toBe(true)
    expect(mockIpc.handlers.has('system:is-supported')).toBe(true)
  })

  it('handles session updates correctly', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

    // Start system monitor
    const startHandler = mockIpc.handlers.get('system:start')
    expect(startHandler).toBeDefined()

    const startResult = await startHandler!()
    expect(mockSystemMonitor.start).toHaveBeenCalled()
    expect(startResult).toEqual({ success: true })

    const mockWindow = mockHelpers.BrowserWindow()
    const sessionEvent = {
      id: 'session-1',
      app: 'Zoom',
      appName: 'Zoom',
      bundleId: 'us.zoom.xos',
      service: 'Camera',
      allowed: true,
      timestamp: new Date(),
      eventType: 'usage' as const,
      pid: 1234
    }

    mockWindow.webContents.send('system:session-update', sessionEvent)

    const getSessionsHandler = mockIpc.handlers.get('system:get-active-sessions')
    expect(getSessionsHandler).toBeDefined()

    mockSystemMonitor.getActiveSessions.mockReturnValue([sessionEvent])
    const sessions = await getSessionsHandler!()
    expect(sessions).toContainEqual(sessionEvent)
  })

  it('tracks active session lifecycle', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

    const startHandler = mockIpc.handlers.get('system:start')
    await startHandler!()

    const sessionStart = {
      id: 'session-1',
      app: 'Slack',
      appName: 'Slack',
      bundleId: 'com.tinyspeck.slackmacgap',
      service: 'Camera',
      allowed: true,
      timestamp: new Date(),
      eventType: 'usage' as const,
      sessionStart: new Date(),
      pid: 1234
    }

    mockSystemMonitor.getActiveSessions.mockReturnValue([sessionStart])
    const getSessionsHandler = mockIpc.handlers.get('system:get-active-sessions')
    let sessions = await getSessionsHandler!()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toHaveProperty('sessionStart')

    const sessionEnd = {
      ...sessionStart,
      sessionEnd: new Date(),
      duration: 5000
    }

    mockSystemMonitor.getActiveSessions.mockReturnValue([])
    sessions = await getSessionsHandler!()
    expect(sessions).toHaveLength(0)
  })

  it('handles event history management', async () => {
    await bootstrap.startApp()
    const mockWindow = mockHelpers.BrowserWindow()

    const events = [
      {
        id: 'event-1',
        app: 'App1',
        appName: 'App 1',
        bundleId: 'com.app1',
        service: 'Camera',
        allowed: true,
        timestamp: new Date(),
        eventType: 'request' as const,
        pid: 1001
      },
      {
        id: 'event-2',
        app: 'App2',
        appName: 'App 2',
        bundleId: 'com.app2',
        service: 'Microphone',
        allowed: false,
        timestamp: new Date(),
        eventType: 'request' as const,
        pid: 1002
      }
    ]

    events.forEach((event) => {
      mockWindow.webContents.send('system:event', event)
    })

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('system:event', expect.any(Object))
  })

  it('stops system monitor', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

    const startHandler = mockIpc.handlers.get('system:start')
    await startHandler!()

    const stopHandler = mockIpc.handlers.get('system:stop')
    expect(stopHandler).toBeDefined()

    const stopResult = await stopHandler!()
    expect(mockSystemMonitor.stop).toHaveBeenCalled()
    expect(stopResult).toEqual({ success: true })
  })

  it('checks system monitoring support', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

    const isSupportedHandler = mockIpc.handlers.get('system:is-supported')
    expect(isSupportedHandler).toBeDefined()

    const isSupported = await isSupportedHandler!()
    expect(typeof isSupported).toBe('boolean')
  })
})
