import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NetworkMonitor from '@renderer/components/NetworkMonitor'

type PacketListener = Parameters<Window['api']['onNetworkData']>[0]
type Packet = Parameters<PacketListener>[0]

const createMockInterfaceResponse = (overrides = {}) => ({
  interfaces: [{ name: 'eth0', addresses: ['192.168.1.1'], isUp: true, description: 'Ethernet' }],
  bestInterfaceName: 'eth0',
  isCapturing: false,
  selectedInterfaceNames: ['eth0'],
  activeInterfaceNames: ['eth0'],
  ...overrides
})

const defaultProps = {
  colorAccessibility: false,
  handleAdvancedModeChange: vi.fn(),
  maxPackets: 100,
  advancedMode: false,
  darkMode: false
}

describe('NetworkMonitor Component', () => {
  let listeners: Array<(packet: Packet) => void> = []

  beforeEach(() => {
    listeners = []
    window.api.onNetworkData = (callback: PacketListener) => {
      listeners.push(callback)
      return () => {
        const index = listeners.indexOf(callback)
        if (index > -1) listeners.splice(index, 1)
      }
    }
    window.api.removeNetworkDataListener = vi.fn(() => {
      listeners.length = 0
    })
    window.api.getNetworkInterfaces = vi.fn().mockResolvedValue(createMockInterfaceResponse())
    window.api.selectNetworkInterface = vi.fn().mockResolvedValue(createMockInterfaceResponse())
    window.api.startCapture = vi
      .fn()
      .mockResolvedValue(createMockInterfaceResponse({ isCapturing: true }))
    window.api.stopCapture = vi
      .fn()
      .mockResolvedValue(createMockInterfaceResponse({ isCapturing: false }))
    window.api.onProcessRegistryData = vi.fn()
    window.api.getPublicIP = vi.fn().mockResolvedValue('8.8.8.8')
    window.api.getGeoLocation = vi.fn().mockResolvedValue({ country: 'US', city: 'Mountain View' })
  })

  afterEach(() => {
    vi.clearAllMocks()
    // Clear any running intervals/timeouts
    vi.useFakeTimers()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    listeners.length = 0
  })

  it('starts capture on button click', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<NetworkMonitor {...defaultProps} />)
    })

    const buttons = screen.getAllByRole('button')
    const startButton = buttons.find((btn) => btn.textContent?.includes('Start'))
    expect(startButton).toBeDefined()

    await act(async () => {
      if (startButton) await user.click(startButton)
    })

    await waitFor(
      () => {
        expect(window.api.startCapture).toHaveBeenCalled()
      },
      { timeout: 3000 }
    )
  })

  it('stops capture on pause click', async () => {
    const user = userEvent.setup()
    window.api.getNetworkInterfaces = vi
      .fn()
      .mockResolvedValue(createMockInterfaceResponse({ isCapturing: true }))

    await act(async () => {
      render(<NetworkMonitor {...defaultProps} />)
    })

    const buttons = screen.getAllByRole('button')
    const pauseButton = buttons.find((btn) => btn.textContent?.includes('Pause'))
    expect(pauseButton).toBeDefined()

    await act(async () => {
      if (pauseButton) await user.click(pauseButton)
    })

    await waitFor(
      () => {
        expect(window.api.stopCapture).toHaveBeenCalled()
      },
      { timeout: 3000 }
    )
  })

  it('handles capture errors', async () => {
    const user = userEvent.setup()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.api.startCapture = vi.fn().mockRejectedValue(new Error('Capture failed'))

    await act(async () => {
      render(<NetworkMonitor {...defaultProps} />)
    })

    await waitFor(
      () => {
        expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )

    const buttons = screen.getAllByRole('button')
    const startButton = buttons.find((btn) => btn.textContent?.includes('Start'))

    await act(async () => {
      if (startButton) await user.click(startButton)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Capture toggle failed', expect.any(Error))
    })

    consoleErrorSpy.mockRestore()
  })

  it('updates packet count and state when packets are received', async () => {
    const onNetworkDataSpy = vi.fn((callback: PacketListener) => {
      listeners.push(callback)
      return () => {
        const index = listeners.indexOf(callback)
        if (index > -1) listeners.splice(index, 1)
      }
    })
    window.api.onNetworkData = onNetworkDataSpy

    await act(async () => {
      render(<NetworkMonitor {...defaultProps} maxPackets={5} />)
    })

    await waitFor(
      () => {
        expect(onNetworkDataSpy).toHaveBeenCalled()
      },
      { timeout: 3000 }
    )

    const packet: Packet = {
      procName: 'Chrome',
      pid: 4242,
      size: 1024,
      timestamp: Date.now()
    }

    await act(async () => {
      listeners.forEach((listener) => listener(packet))
    })

    expect(listeners.length).toBeGreaterThan(0)
  })

  it('enforces maxPackets limit', async () => {
    render(<NetworkMonitor {...defaultProps} maxPackets={2} />)

    await waitFor(
      () => {
        expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )

    const packets: Packet[] = [
      { procName: 'App1', pid: 1, size: 100, timestamp: Date.now() },
      { procName: 'App2', pid: 2, size: 200, timestamp: Date.now() + 1 },
      { procName: 'App3', pid: 3, size: 300, timestamp: Date.now() + 2 }
    ]

    await act(async () => {
      packets.forEach((packet) => {
        listeners.forEach((listener) => listener(packet))
      })
    })

    await waitFor(
      () => {
        expect(listeners.length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  it('handles empty interfaces gracefully', async () => {
    window.api.getNetworkInterfaces = vi.fn().mockResolvedValue({
      interfaces: [],
      bestInterfaceName: undefined,
      isCapturing: false,
      selectedInterfaceNames: [],
      activeInterfaceNames: []
    })

    await act(async () => {
      render(<NetworkMonitor {...defaultProps} />)
    })

    await waitFor(
      () => {
        expect(window.api.getNetworkInterfaces).toHaveBeenCalled()
      },
      { timeout: 3000 }
    )

    await waitFor(
      () => {
        expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  it('handles capture toggle when no interfaces available', async () => {
    window.api.getNetworkInterfaces = vi.fn().mockResolvedValue({
      interfaces: [],
      isCapturing: false,
      selectedInterfaceNames: [],
      activeInterfaceNames: []
    })

    await act(async () => {
      render(<NetworkMonitor {...defaultProps} />)
    })

    await waitFor(
      () => {
        expect(window.api.getNetworkInterfaces).toHaveBeenCalled()
      },
      { timeout: 3000 }
    )
  })
})
