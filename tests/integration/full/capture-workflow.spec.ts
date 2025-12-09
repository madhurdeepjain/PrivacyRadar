import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as bootstrap from '../../../src/main/app/bootstrap'

const mockHelpers = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const packetListeners = new Set<(packet: unknown) => void>()
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
          if (channel === 'network:packet') {
            packetListeners.forEach((listener) => listener(data))
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
  }))
}))

vi.mock('@infra/db/migrate', () => ({
  runMigrations: vi.fn()
}))

const mockStartAnalyzer = vi.fn(() => Promise.resolve())
const mockStopAnalyzer = vi.fn()
const mockGetInterfaceSelection = vi.fn(() => ({
  interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true }],
  selectedInterfaceNames: ['eth0'],
  isCapturing: false,
  activeInterfaceNames: ['eth0']
}))
const mockUpdateAnalyzerInterfaces = vi.fn(async () => {
  mockGetInterfaceSelection.mockReturnValue({
    interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true }],
    selectedInterfaceNames: ['eth0'],
    isCapturing: false,
    activeInterfaceNames: ['eth0']
  })
  return Promise.resolve()
})

vi.mock('@main/app/analyzer-runner', () => ({
  getInterfaceSelection: () => mockGetInterfaceSelection(),
  startAnalyzer: () => mockStartAnalyzer(),
  stopAnalyzer: () => mockStopAnalyzer(),
  updateAnalyzerInterfaces: () => mockUpdateAnalyzerInterfaces(),
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

describe('Capture Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockGetInterfaceSelection.mockReturnValue({
      interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true }],
      selectedInterfaceNames: ['eth0'],
      isCapturing: false,
      activeInterfaceNames: ['eth0']
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('completes full capture workflow', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

    expect(mockIpc.handlers.has('network:startCapture')).toBe(true)
    expect(mockIpc.handlers.has('network:stopCapture')).toBe(true)

    const startHandler = mockIpc.handlers.get('network:startCapture')
    expect(startHandler).toBeDefined()

    mockGetInterfaceSelection.mockReturnValue({
      interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true }],
      selectedInterfaceNames: ['eth0'],
      isCapturing: true,
      activeInterfaceNames: ['eth0']
    })

    const startResult = await startHandler!()
    expect(mockStartAnalyzer).toHaveBeenCalled()
    expect(startResult.isCapturing).toBe(true)
    expect(startResult).toHaveProperty('interfaces')
    expect(startResult).toHaveProperty('selectedInterfaceNames')
    expect(startResult).toHaveProperty('activeInterfaceNames')
    expect(Array.isArray(startResult.interfaces)).toBe(true)
    expect(Array.isArray(startResult.selectedInterfaceNames)).toBe(true)

    const mockWindow = mockHelpers.BrowserWindow()
    const packet = {
      procName: 'Firefox',
      pid: 1234,
      size: 1024,
      timestamp: Date.now()
    }
    mockWindow.webContents.send('network:packet', packet)

    mockGetInterfaceSelection.mockReturnValue({
      interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true }],
      selectedInterfaceNames: ['eth0'],
      isCapturing: false,
      activeInterfaceNames: []
    })

    const stopHandler = mockIpc.handlers.get('network:stopCapture')
    expect(stopHandler).toBeDefined()

    const stopResult = await stopHandler!()
    expect(mockStopAnalyzer).toHaveBeenCalled()
    expect(stopResult.isCapturing).toBe(false)
    expect(stopResult.activeInterfaceNames).toEqual([])
    expect(stopResult).toHaveProperty('interfaces')
  })

  it('handles interface switching during active capture', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

    // Start capture
    mockGetInterfaceSelection.mockReturnValue({
      interfaces: [
        { name: 'eth0', addresses: ['192.168.1.1'], isUp: true },
        { name: 'wlan0', addresses: ['192.168.1.2'], isUp: true }
      ],
      selectedInterfaceNames: ['eth0'],
      isCapturing: true,
      activeInterfaceNames: ['eth0']
    })

    const startHandler = mockIpc.handlers.get('network:startCapture')
    await startHandler!()

    const selectHandler = mockIpc.handlers.get('network:selectInterface')
    expect(selectHandler).toBeDefined()

    mockUpdateAnalyzerInterfaces.mockImplementation(async () => {
      mockGetInterfaceSelection.mockReturnValue({
        interfaces: [
          { name: 'eth0', addresses: ['192.168.1.1'], isUp: true },
          { name: 'wlan0', addresses: ['192.168.1.2'], isUp: true }
        ],
        selectedInterfaceNames: ['wlan0'],
        isCapturing: true,
        activeInterfaceNames: ['wlan0']
      })
    })

    const selectResult = await selectHandler!(null, ['wlan0'])
    expect(mockUpdateAnalyzerInterfaces).toHaveBeenCalled()
    expect(selectResult.selectedInterfaceNames).toContain('wlan0')
    expect(selectResult.isCapturing).toBe(true)
    expect(selectResult.activeInterfaceNames).toContain('wlan0')
    expect(selectResult).toHaveProperty('interfaces')
    expect(Array.isArray(selectResult.interfaces)).toBe(true)
  })

  it('verifies state transitions', async () => {
    await bootstrap.startApp()
    const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

    const getInterfacesHandler = mockIpc.handlers.get('network:getInterfaces')
    expect(getInterfacesHandler).toBeDefined()

    let state = await getInterfacesHandler!()
    expect(state.isCapturing).toBe(false)

    mockGetInterfaceSelection.mockReturnValue({
      interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true }],
      selectedInterfaceNames: ['eth0'],
      isCapturing: true,
      activeInterfaceNames: ['eth0']
    })

    const startHandler = mockIpc.handlers.get('network:startCapture')
    state = await startHandler!()
    expect(state.isCapturing).toBe(true)
    expect(state.activeInterfaceNames).toContain('eth0')

    mockGetInterfaceSelection.mockReturnValue({
      interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true }],
      selectedInterfaceNames: ['eth0'],
      isCapturing: false,
      activeInterfaceNames: []
    })

    const stopHandler = mockIpc.handlers.get('network:stopCapture')
    state = await stopHandler!()
    expect(state.isCapturing).toBe(false)
    expect(state.activeInterfaceNames).toEqual([])
  })

  describe('Error Handling', () => {
    it('handles analyzer start failures', async () => {
      await bootstrap.startApp()
      const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

      mockStartAnalyzer.mockRejectedValueOnce(new Error('Failed to start analyzer'))
      const startHandler = mockIpc.handlers.get('network:startCapture')

      await expect(startHandler!()).rejects.toThrow('Failed to start analyzer')
      expect(mockStartAnalyzer).toHaveBeenCalled()
    })

    it.each([
      ['invalid interface name', ['invalid-interface'], 'Invalid interface names'],
      [
        'non-array input',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'not-an-array' as any,
        'must be an array'
      ]
    ])('rejects %s in interface selection', async (_name, input, expectedError) => {
      await bootstrap.startApp()
      const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

      if (Array.isArray(input)) {
        mockUpdateAnalyzerInterfaces.mockRejectedValueOnce(
          new Error(`${expectedError}: must be an array of valid interface name strings`)
        )
      }

      const selectHandler = mockIpc.handlers.get('network:selectInterface')
      expect(selectHandler).toBeDefined()

      await expect(selectHandler!(null, input)).rejects.toThrow()
    })

    it.each([
      [
        'analyzer stop failure',
        async (mockIpc: typeof mockHelpers.ipcMain) => {
          mockGetInterfaceSelection.mockReturnValue({
            interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true }],
            selectedInterfaceNames: ['eth0'],
            isCapturing: true,
            activeInterfaceNames: ['eth0']
          })
          const startHandler = mockIpc.handlers.get('network:startCapture')
          await startHandler!()
          mockStopAnalyzer.mockImplementation(() => {
            throw new Error('Analyzer stop failed')
          })
          const stopHandler = mockIpc.handlers.get('network:stopCapture')
          await expect(stopHandler!()).rejects.toThrow('Analyzer stop failed')
        }
      ],
      [
        'interface update failure',
        async (mockIpc: typeof mockHelpers.ipcMain) => {
          mockGetInterfaceSelection.mockReturnValue({
            interfaces: [
              { name: 'eth0', addresses: ['192.168.1.1'], isUp: true },
              { name: 'wlan0', addresses: ['192.168.1.2'], isUp: true }
            ],
            selectedInterfaceNames: ['eth0'],
            isCapturing: true,
            activeInterfaceNames: ['eth0']
          })
          const startHandler = mockIpc.handlers.get('network:startCapture')
          await startHandler!()
          mockUpdateAnalyzerInterfaces.mockRejectedValueOnce(
            new Error('Failed to update network analyzer interface selection')
          )
          const selectHandler = mockIpc.handlers.get('network:selectInterface')
          await expect(selectHandler!(null, ['wlan0'])).rejects.toThrow()
        }
      ]
    ])('handles %s during active capture', async (_name, testFn) => {
      await bootstrap.startApp()
      const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain
      await testFn(mockIpc)
    })

    it('handles getInterfaces when no interfaces available', async () => {
      await bootstrap.startApp()
      const mockIpc = (await import('electron')).ipcMain as typeof mockHelpers.ipcMain

      mockGetInterfaceSelection.mockReturnValue({
        interfaces: [],
        selectedInterfaceNames: [],
        isCapturing: false,
        activeInterfaceNames: []
      })

      const getInterfacesHandler = mockIpc.handlers.get('network:getInterfaces')
      const result = await getInterfacesHandler!()

      expect(result.interfaces).toEqual([])
      expect(result.isCapturing).toBe(false)
    })
  })
})
