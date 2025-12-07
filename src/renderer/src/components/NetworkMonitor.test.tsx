import '@testing-library/jest-dom/vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkMonitor } from './NetworkMonitor'

type PacketListener = Parameters<Window['api']['onNetworkData']>[0]
type Packet = Parameters<PacketListener>[0]

const createMockInterfaceResponse = (overrides = {}) => ({
  interfaces: [
    { name: 'eth0', addresses: ['192.168.1.1'], isUp: true, description: 'Ethernet' }
  ],
  bestInterfaceName: 'eth0',
  isCapturing: false,
  selectedInterfaceNames: ['eth0'],
  activeInterfaceNames: ['eth0'],
  ...overrides
})

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
    window.api.startCapture = vi.fn().mockResolvedValue(createMockInterfaceResponse({ isCapturing: true }))
    window.api.stopCapture = vi.fn().mockResolvedValue(createMockInterfaceResponse({ isCapturing: false }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders', async () => {
    await act(async () => {
      render(<NetworkMonitor />)
    })

    await waitFor(() => {
      expect(screen.getAllByText(/throughput/i).length).toBeGreaterThan(0)
    })
  })

  it('starts capture on button click', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<NetworkMonitor />)
    })

    const buttons = screen.getAllByRole('button')
    const startButton = buttons.find((btn) => btn.textContent?.includes('Start'))
    expect(startButton).toBeDefined()

    await act(async () => {
      if (startButton) await user.click(startButton)
    })

    await waitFor(() => {
      expect(window.api.startCapture).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

  it('stops capture on pause click', async () => {
    const user = userEvent.setup()
    window.api.getNetworkInterfaces = vi.fn().mockResolvedValue(createMockInterfaceResponse({ isCapturing: true }))

    await act(async () => {
      render(<NetworkMonitor />)
    })

    const buttons = screen.getAllByRole('button')
    const pauseButton = buttons.find((btn) => btn.textContent?.includes('Pause'))
    expect(pauseButton).toBeDefined()

    await act(async () => {
      if (pauseButton) await user.click(pauseButton)
    })

    await waitFor(() => {
      expect(window.api.stopCapture).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

  it('handles capture errors', async () => {
    const user = userEvent.setup()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.api.startCapture = vi.fn().mockRejectedValue(new Error('Capture failed'))

    await act(async () => {
      render(<NetworkMonitor />)
    })

    await waitFor(() => {
      expect(screen.getAllByText(/throughput/i).length).toBeGreaterThan(0)
    })

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


  it('processes packets', async () => {
    await act(async () => {
      render(<NetworkMonitor />)
    })

    await waitFor(() => {
      expect(screen.getAllByText(/throughput/i).length).toBeGreaterThan(0)
    })

    const packet: Packet = {
      procName: 'Chrome',
      pid: 4242,
      size: 1024,
      timestamp: Date.now()
    }

    await act(async () => {
      listeners.forEach((listener) => listener(packet))
    })

    await waitFor(() => {
      const packetTexts = screen.getAllByText('1')
      expect(packetTexts.length).toBeGreaterThan(0)
    })
  })
})
