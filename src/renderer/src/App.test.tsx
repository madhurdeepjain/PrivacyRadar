import '@testing-library/jest-dom/vitest'
import { render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

type PacketListener = Parameters<Window['api']['onNetworkData']>[0]
type Packet = Parameters<PacketListener>[0]

describe('App dashboard', () => {
  const listeners: Array<(packet: Packet) => void> = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

    listeners.length = 0
    window.api.onNetworkData = (callback) => {
      listeners.push(callback)
    }
    window.api.removeNetworkDataListener = () => {
      listeners.length = 0
    }
    window.api.getNetworkInterfaces = vi.fn().mockResolvedValue({
      interfaces: [],
      bestInterfaceName: undefined,
      isCapturing: false,
      selectedInterfaceNames: [],
      activeInterfaceNames: []
    })
    window.api.selectNetworkInterface = vi.fn().mockResolvedValue({
      interfaces: [],
      bestInterfaceName: undefined,
      isCapturing: false,
      selectedInterfaceNames: [],
      activeInterfaceNames: []
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the idle state when no packets have arrived', async () => {
    await act(async () => {
      render(<App />)
      await Promise.resolve()
    })

    expect(
      screen.getByRole('heading', { level: 1, name: /network operations/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/listening for network activity/i)).toBeInTheDocument()
    expect(screen.getByText('Packets captured')).toBeInTheDocument()
  })

  it('updates metrics when new packet data streams in', async () => {
    await act(async () => {
      render(<App />)
      await Promise.resolve()
    })

    const samplePacket: Packet = {
      procName: 'Test App',
      pid: 4242,
      size: 2048,
      srcIP: '10.0.0.42',
      dstIP: '1.1.1.1',
      srcport: 12345,
      dstport: 443,
      protocol: 'TCP',
      timestamp: Date.now(),
      ethernet: {
        srcmac: '00:00:00:00:00:00',
        dstmac: 'ff:ff:ff:ff:ff:ff',
        type: 2048
      }
    }

    await act(async () => {
      listeners.forEach((listener) => listener(samplePacket))
      await Promise.resolve()
    })

    expect(screen.getByText(/streaming now/i)).toBeInTheDocument()
    const appMentions = screen.getAllByText(/test app/i)
    expect(appMentions.length).toBeGreaterThanOrEqual(2)
    appMentions.forEach((element) => {
      expect(element).toBeVisible()
    })

    const processIds = screen.getAllByText(/pid\s+4242/i)
    expect(processIds.length).toBeGreaterThanOrEqual(2)
    processIds.forEach((element) => {
      expect(element).toBeVisible()
    })
    expect(screen.getAllByText('TCP')[0]).toBeInTheDocument()
  })
})
