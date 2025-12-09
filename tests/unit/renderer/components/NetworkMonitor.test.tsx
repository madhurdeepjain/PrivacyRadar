import '@testing-library/jest-dom/vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react'
import NetworkMonitor from '@renderer/components/NetworkMonitor'

type PacketListener = Parameters<Window['api']['onNetworkData']>[0]
type Packet = Parameters<PacketListener>[0]

const createMockInterfaceResponse = (
  overrides = {}
): {
  interfaces: Array<{ name: string; addresses: string[]; isUp: boolean; description: string }>
  bestInterfaceName: string
  selectedInterfaceNames: string[]
  isCapturing: boolean
  activeInterfaceNames: string[]
} => ({
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

  afterEach(async () => {
    vi.clearAllMocks()
    listeners.length = 0
    // Give any pending timers a chance to complete
    await new Promise((resolve) => setTimeout(resolve, 100))
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

    await waitFor(() => {
      expect(window.api.startCapture).toHaveBeenCalled()
    }, 3000)
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

    await waitFor(() => {
      expect(window.api.stopCapture).toHaveBeenCalled()
    }, 3000)
  })

  it('handles capture errors gracefully', async () => {
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

    const buttonsAfterError = screen.getAllByRole('button')
    expect(buttonsAfterError.length).toBeGreaterThan(0)
    const retryButton = buttonsAfterError.find((btn) => btn.textContent?.includes('Start'))
    expect(retryButton).toBeDefined()

    consoleErrorSpy.mockRestore()
  })

  it('enforces maxPackets limit', async () => {
    await act(async () => {
      render(<NetworkMonitor {...defaultProps} maxPackets={3} />)
    })

    await waitFor(
      () => {
        expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )

    // Send 5 packets, but maxPackets is 3
    const packets: Packet[] = Array.from({ length: 5 }, (_, i) => ({
      procName: `App${i}`,
      pid: 1000 + i,
      size: 100,
      timestamp: Date.now() + i,
      srcIP: '192.168.1.1',
      dstIP: '8.8.8.8',
      protocol: 'TCP' as const,
      appName: `App${i}`,
      appDisplayName: `App${i}`
    }))

    await act(async () => {
      packets.forEach((packet) => {
        listeners.forEach((listener) => listener(packet))
      })
      await Promise.resolve()
      // Give React time to update
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    await waitFor(() => {
      const appTexts = screen.queryAllByText(/App/i)
      expect(appTexts.length).toBeGreaterThan(0)
      const waitingText = screen.queryByText(/waiting for network activity/i)
      expect(waitingText).toBeNull()
    }, 5000)
  })
})
