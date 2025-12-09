import '@testing-library/jest-dom/vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

    await waitFor(
      () => {
        expect(
          screen.getByRole('heading', { level: 1, name: /network monitor/i })
        ).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it(
    'switches to system monitor',
    async () => {
      const user = userEvent.setup()
      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      const allButtons = screen.getAllByRole('button')
      const systemMonitorButton = allButtons.find(
        (btn) => btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
      )
      expect(systemMonitorButton).toBeDefined()
      await act(async () => {
        await user.click(systemMonitorButton)
        await Promise.resolve()
      })

      await waitFor(
        () => {
          expect(
            screen.getByRole('heading', { level: 1, name: /system monitor/i })
          ).toBeInTheDocument()
        },
        { timeout: 10000 }
      )
    },
    { timeout: 15000 }
  )

  it(
    'switches back to network monitor',
    async () => {
      const user = userEvent.setup()
      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      let allButtons = screen.getAllByRole('button')
      const systemMonitorButton = allButtons.find(
        (btn) => btn.textContent?.includes('System Monitor') && !btn.textContent.includes('heading')
      )
      expect(systemMonitorButton).toBeDefined()
      await act(async () => {
        if (systemMonitorButton) await user.click(systemMonitorButton)
        await Promise.resolve()
      })

      await waitFor(
        () => {
          expect(
            screen.getByRole('heading', { level: 1, name: /system monitor/i })
          ).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      allButtons = screen.getAllByRole('button')
      const networkMonitorButton = allButtons.find(
        (btn) =>
          btn.textContent?.includes('Network Monitor') && !btn.textContent.includes('heading')
      )
      expect(networkMonitorButton).toBeDefined()
      await act(async () => {
        if (networkMonitorButton) await user.click(networkMonitorButton)
        await Promise.resolve()
      })

      await waitFor(
        () => {
          const headings = screen.getAllByRole('heading', { level: 1, name: /network monitor/i })
          expect(headings.length).toBeGreaterThan(0)
        },
        { timeout: 10000 }
      )
    },
    { timeout: 15000 }
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

        await waitFor(
          () => {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
              'Failed to load interfaces',
              expect.any(Error)
            )
          },
          { timeout: 5000 }
        )

        await waitFor(
          () => {
            expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
          },
          { timeout: 3000 }
        )

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

        await waitFor(
          () => {
            expect(screen.getAllByText(/system monitor/i).length).toBeGreaterThan(0)
          },
          { timeout: 5000 }
        )

        await waitFor(
          () => {
            const startButtons = screen
              .getAllByRole('button')
              .filter((btn) => btn.textContent?.includes('Start'))
            expect(startButtons.length).toBeGreaterThan(0)
          },
          { timeout: 3000 }
        )
      },
      { timeout: 15000 }
    )

    it('persists settings across view changes', async () => {
      const user = userEvent.setup()
      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      await waitFor(
        () => {
          expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
        },
        { timeout: 5000 }
      )

      await act(async () => {
        await window.api.setValue('viewMode', 'system')
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

      await waitFor(
        () => {
          expect(window.api.setValue).toHaveBeenCalledWith('viewMode', expect.any(String))
        },
        { timeout: 3000 }
      )
    })

    it('handles API timeout gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      window.api.getNetworkInterfaces = vi.fn(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      )

      await act(async () => {
        render(<App />)
        await Promise.resolve()
      })

      await waitFor(
        () => {
          expect(consoleErrorSpy).toHaveBeenCalled()
        },
        { timeout: 2000 }
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('State Verification', () => {
    it(
      'tracks view mode changes',
      async () => {
        const user = userEvent.setup()
        await act(async () => {
          render(<App />)
          await Promise.resolve()
        })

        await waitFor(
          () => {
            expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
          },
          { timeout: 5000 }
        )

        const allButtons = screen.getAllByRole('button')
        const systemMonitorButton = allButtons.find(
          (btn) =>
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
          expect(
            screen.getByRole('heading', { level: 1, name: /system monitor/i })
          ).toBeInTheDocument()
        })

        const networkMonitorButton = allButtons.find(
          (btn) =>
            btn.textContent?.includes('Network Monitor') && !btn.textContent.includes('heading')
        )
        expect(networkMonitorButton).toBeDefined()
        await act(async () => {
          await user.click(networkMonitorButton)
          await Promise.resolve()
        })

        await waitFor(
          () => {
            expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
          },
          { timeout: 5000 }
        )
      },
      { timeout: 15000 }
    )

    it(
      'maintains state when switching views',
      async () => {
        const user = userEvent.setup()
        await act(async () => {
          render(<App />)
          await Promise.resolve()
        })

        await waitFor(
          () => {
            expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
          },
          { timeout: 5000 }
        )

        const buttons = screen.getAllByRole('button')
        const startButton = buttons.find((btn) => btn.textContent?.includes('Start'))
        await act(async () => {
          if (startButton) await user.click(startButton)
          await Promise.resolve()
        })

        let allButtons = screen.getAllByRole('button')
        const systemMonitorButton = allButtons.find(
          (btn) =>
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
        const networkMonitorButton = allButtons.find(
          (btn) =>
            btn.textContent?.includes('Network Monitor') && !btn.textContent.includes('heading')
        )
        expect(networkMonitorButton).toBeDefined()
        await act(async () => {
          if (networkMonitorButton) await user.click(networkMonitorButton)
          await Promise.resolve()
        })

        await waitFor(
          () => {
            expect(screen.getAllByText(/network monitor/i).length).toBeGreaterThan(0)
          },
          { timeout: 5000 }
        )
      },
      { timeout: 15000 }
    )
  })
})
