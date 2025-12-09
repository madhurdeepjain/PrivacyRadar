import '@testing-library/jest-dom/vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react'
import App from '@renderer/App'

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
    window.api.getValue = vi.fn().mockResolvedValue('')
    window.api.setValue = vi.fn().mockResolvedValue(undefined)
    window.api.onProcessRegistryData = vi.fn()
    window.api.getPublicIP = vi.fn().mockResolvedValue('8.8.8.8')
    window.api.getGeoLocation = vi.fn().mockResolvedValue({ country: 'US', city: 'Mountain View' })
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
    window.api.getValue = vi.fn().mockImplementation((key: string) => {
      if (key === 'viewMode') return Promise.resolve('network')
      return Promise.resolve('')
    })

    await act(async () => {
      render(<App />)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /network monitor/i })
      ).toBeInTheDocument()
    }, 3000)
  })

  it('switches to System Monitor view', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<App />)
      await Promise.resolve()
    })

    const systemMonitorButtons = screen.getAllByRole('button', { name: /system monitor/i })
    const systemMonitorButton =
      systemMonitorButtons.find((btn) => !btn.closest('h1, h2, h3, h4, h5, h6')) ||
      systemMonitorButtons[0]
    await act(async () => {
      await user.click(systemMonitorButton)
      await Promise.resolve()
    })

    await waitFor(() => {
      const headings = screen.queryAllByRole('heading', { level: 1, name: /system monitor/i })
      expect(headings.length).toBeGreaterThan(0)
    }, 10000)
  }, 15000)

  it(
    'switches back to Network Monitor view',
    async () => {
      const user = userEvent.setup()
      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
      }, 5000)

      const systemMonitorButtons = screen.getAllByRole('button', { name: /system monitor/i })
      const systemMonitorButton =
        systemMonitorButtons.find((btn) => !btn.closest('h1, h2, h3, h4, h5, h6')) ||
        systemMonitorButtons[0]
      await act(async () => {
        await user.click(systemMonitorButton)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: /system monitor/i })
        ).toBeInTheDocument()
      }, 10000)

      const networkMonitorButtons = screen.getAllByRole('button', { name: /network monitor/i })
      const networkMonitorButton =
        networkMonitorButtons.find((btn) => !btn.closest('h1, h2, h3, h4, h5, h6')) ||
        networkMonitorButtons[0]
      await act(async () => {
        await user.click(networkMonitorButton)
        await Promise.resolve()
      })

      await waitFor(() => {
        const networkMonitorTexts = screen.getAllByText(/network monitor/i)
        expect(networkMonitorTexts.length).toBeGreaterThan(0)
      }, 10000)
    },
    { timeout: 20000 }
  )

  describe('Error Scenarios', () => {
    it(
      'handles network API failures gracefully',
      async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        window.api.getNetworkInterfaces = vi.fn().mockRejectedValue(new Error('API failed'))

        await act(async () => {
          render(<App />)
          await Promise.resolve()
        })

        await waitFor(() => {
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to load interfaces',
            expect.any(Error)
          )
        }, 5000)

        await waitFor(() => {
          expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
        }, 3000)

        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBeGreaterThan(0)

        consoleErrorSpy.mockRestore()
      },
      { timeout: 10000 }
    )

    it(
      'handles system monitor API failures gracefully',
      async () => {
        const user = userEvent.setup()
        window.systemAPI.start = vi.fn().mockRejectedValue(new Error('System monitor failed'))

        await act(async () => {
          render(<App />)
          await Promise.resolve()
        })

        const allButtons = screen.getAllByRole('button')
        const systemMonitorButton = allButtons.find(
          (btn) =>
            btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
        )
        expect(systemMonitorButton).toBeDefined()

        await act(async () => {
          await user.click(systemMonitorButton)
          await Promise.resolve()
        })

        await waitFor(() => {
          expect(screen.getAllByText(/system monitor/i).length).toBeGreaterThan(0)
        }, 5000)

        await waitFor(() => {
          const startButtons = screen
            .getAllByRole('button')
            .filter((btn) => btn.textContent?.includes('Start'))
          expect(startButtons.length).toBeGreaterThan(0)
        }, 3000)

        const networkMonitorButton = allButtons.find(
          (btn) =>
            btn.textContent?.includes('Network Monitor') && !btn.textContent.includes('heading')
        )
        expect(networkMonitorButton).toBeDefined()
      },
      { timeout: 15000 }
    )
  })

  describe('Settings Persistence', () => {
    it('persists viewMode setting across component remounts', async () => {
      const storedViewMode = 'system'
      window.api.getValue = vi.fn().mockImplementation((key: string) => {
        if (key === 'viewMode') return Promise.resolve(storedViewMode)
        return Promise.resolve('')
      })

      // First render
      const { unmount } = render(<App />)
      await waitFor(() => {
        expect(screen.getAllByText(/system monitor/i).length).toBeGreaterThan(0)
      }, 5000)

      expect(window.api.getValue).toHaveBeenCalledWith('viewMode')

      // Unmount component
      unmount()

      // Remount component
      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(screen.getAllByText(/system monitor/i).length).toBeGreaterThan(0)
      }, 5000)

      expect(window.api.getValue).toHaveBeenCalledWith('viewMode')
    })

    it('calls setValue when view mode changes', async () => {
      const user = userEvent.setup()
      window.api.getValue = vi.fn().mockImplementation((key: string) => {
        if (key === 'viewMode') return Promise.resolve('network')
        return Promise.resolve('')
      })

      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      const allButtons = screen.getAllByRole('button')
      const systemMonitorButton = allButtons.find(
        (btn) => btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
      )

      await act(async () => {
        if (systemMonitorButton) await user.click(systemMonitorButton)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(window.api.setValue).toHaveBeenCalledWith('viewMode', 'system')
      }, 5000)
    })
  })

  describe('IPC Integration', () => {
    it('reads settings via window.api.getValue on mount', async () => {
      window.api.getValue = vi.fn().mockImplementation((key: string) => {
        if (key === 'viewMode') return Promise.resolve('system')
        return Promise.resolve('')
      })

      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      await waitFor(() => {
        expect(window.api.getValue).toHaveBeenCalledWith('viewMode')
      }, 5000)
    })
  })
})
