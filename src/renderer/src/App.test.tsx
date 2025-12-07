import '@testing-library/jest-dom/vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App Component', () => {
  beforeEach(() => {
    window.api.getNetworkInterfaces = vi.fn().mockResolvedValue({
      interfaces: [],
      bestInterfaceName: undefined,
      isCapturing: false,
      selectedInterfaceNames: [],
      activeInterfaceNames: []
    })
    window.api.onNetworkData = vi.fn()
    window.api.removeNetworkDataListener = vi.fn()
    window.api.selectNetworkInterface = vi.fn().mockResolvedValue({
      interfaces: [],
      bestInterfaceName: undefined,
      isCapturing: false,
      selectedInterfaceNames: [],
      activeInterfaceNames: []
    })
    window.api.startCapture = vi.fn().mockResolvedValue({
      interfaces: [],
      bestInterfaceName: undefined,
      isCapturing: true,
      selectedInterfaceNames: [],
      activeInterfaceNames: []
    })
    window.api.stopCapture = vi.fn().mockResolvedValue({
      interfaces: [],
      bestInterfaceName: undefined,
      isCapturing: false,
      selectedInterfaceNames: [],
      activeInterfaceNames: []
    })
    window.systemAPI = {
      onEvent: vi.fn(),
      onSessionUpdate: vi.fn(),
      removeAllListeners: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getActiveSessions: vi.fn().mockResolvedValue([])
    } as typeof window.systemAPI
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders network monitor by default', async () => {
    await act(async () => {
      render(<App />)
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { level: 1, name: /network monitor/i })).toBeInTheDocument()
  })

  it('switches to system monitor', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<App />)
      await Promise.resolve()
    })

    const allButtons = screen.getAllByRole('button')
    const systemMonitorButton = allButtons.find((btn) => 
      btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
    )
    expect(systemMonitorButton).toBeDefined()
    await act(async () => {
      await user.click(systemMonitorButton)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /system monitor/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('switches back to network monitor', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<App />)
      await Promise.resolve()
    })

    let allButtons = screen.getAllByRole('button')
    const systemMonitorButton = allButtons.find((btn) => 
      btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
    )
    expect(systemMonitorButton).toBeDefined()
    await act(async () => {
      if (systemMonitorButton) await user.click(systemMonitorButton)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /system monitor/i })).toBeInTheDocument()
    }, { timeout: 3000 })

    allButtons = screen.getAllByRole('button')
    const networkMonitorButton = allButtons.find((btn) => 
      btn.textContent?.includes('Network Monitor') && !btn.textContent.includes('heading')
    )
    expect(networkMonitorButton).toBeDefined()
    await act(async () => {
      if (networkMonitorButton) await user.click(networkMonitorButton)
      await Promise.resolve()
    })

    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 1, name: /network monitor/i })
      expect(headings.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('renders sidebar', async () => {
    await act(async () => {
      render(<App />)
      await Promise.resolve()
    })

    const allButtons = screen.getAllByRole('button')
    const networkButton = allButtons.find((btn) => btn.textContent?.includes('Network Monitor'))
    const systemButton = allButtons.find((btn) => btn.textContent?.includes('System Monitor'))
    expect(networkButton).toBeDefined()
    expect(systemButton).toBeDefined()
  })

  describe('Error Scenarios', () => {
    it('handles network API failures', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      window.api.getNetworkInterfaces = vi.fn().mockRejectedValue(new Error('API failed'))

      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      await waitFor(() => {
        const allButtons = screen.getAllByRole('button')
        const networkButton = allButtons.find((btn) => btn.textContent?.includes('Network Monitor'))
        expect(networkButton).toBeDefined()
      })

      await waitFor(() => {
        expect(screen.getAllByText(/throughput/i).length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      consoleErrorSpy.mockRestore()
    })

    it('handles system monitor API failures', async () => {
      const user = userEvent.setup()
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      window.systemAPI.start = vi.fn().mockRejectedValue(new Error('System monitor failed'))

      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      const allButtons = screen.getAllByRole('button')
      const systemMonitorButton = allButtons.find((btn) => 
        btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
      )
      expect(systemMonitorButton).toBeDefined()
      await act(async () => {
        await user.click(systemMonitorButton)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getAllByText(/system monitor/i).length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      consoleErrorSpy.mockRestore()
    })

    it('continues to function when network data listener fails', async () => {
      window.api.onNetworkData = vi.fn(() => () => {})

      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      await waitFor(() => {
        const allButtons = screen.getAllByRole('button')
        const networkButton = allButtons.find((btn) => btn.textContent?.includes('Network Monitor'))
        expect(networkButton).toBeDefined()
      })
    })
  })

  describe('State Verification', () => {
    it('tracks view mode changes', async () => {
      const user = userEvent.setup()
      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getAllByText(/throughput/i).length).toBeGreaterThan(0)
      })

      const allButtons = screen.getAllByRole('button')
      const systemMonitorButton = allButtons.find((btn) => 
        btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
      )
      expect(systemMonitorButton).toBeDefined()
      await act(async () => {
        if (systemMonitorButton) await user.click(systemMonitorButton)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getAllByText(/system monitor/i).length).toBeGreaterThan(0)
      })

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /system monitor/i })).toBeInTheDocument()
      })

      const networkMonitorButton = allButtons.find((btn) => 
        btn.textContent?.includes('Network Monitor') && !btn.textContent.includes('heading')
      )
      expect(networkMonitorButton).toBeDefined()
      await act(async () => {
        await user.click(networkMonitorButton)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getAllByText(/throughput/i).length).toBeGreaterThan(0)
      })
    })

    it('maintains state when switching views', async () => {
      const user = userEvent.setup()
      await act(async () => {
        render(<App />)
        await Promise.resolve()
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

      let allButtons = screen.getAllByRole('button')
      const systemMonitorButton = allButtons.find((btn) => 
        btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
      )
      expect(systemMonitorButton).toBeDefined()
      await act(async () => {
        if (systemMonitorButton) await user.click(systemMonitorButton)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getAllByText(/system monitor/i).length).toBeGreaterThan(0)
      })

      allButtons = screen.getAllByRole('button')
      const networkMonitorButton = allButtons.find((btn) => 
        btn.textContent?.includes('Network Monitor') && !btn.textContent.includes('heading')
      )
      expect(networkMonitorButton).toBeDefined()
      await act(async () => {
        if (networkMonitorButton) await user.click(networkMonitorButton)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getAllByText(/throughput/i).length).toBeGreaterThan(0)
      })
    })
  })

})
