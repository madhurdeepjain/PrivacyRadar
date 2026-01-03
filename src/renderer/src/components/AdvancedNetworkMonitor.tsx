import * as React from 'react'
import { Activity, Database, Globe, Play, Pause, Settings2, Baby, Sparkles } from 'lucide-react'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button } from './ui/button'
import { StatCard } from './StatCard'
import { InterfaceSelector } from './InterfaceSelector'
import { ActivityList } from './ActivityList'
import ExportReports from './ExportReports'
import { AppInsights } from './AppInsights'
import { AppStats, InterfaceOption } from '@renderer/types'
import { PacketMetadata } from '../types'

type GeoLocationEntry = {
  country?: string
  regionName?: string
  region?: string
  city?: string
  packetCount?: number
}

type GeoSummary = {
  topCountries: { country: string; count: number }[]
  totalFlows: number
}

type AppWithGeo = AppStats & {
  geoLocations?: GeoLocationEntry[] | null
}

type PacketWithGeo = PacketMetadata & {
  geo?: { country?: string } | null
  destinationCountry?: string | null
  country?: string | null
  dstCountry?: string | null
}

type PrivacyApi = {
  getPrivacySummary: (snapshot: unknown) => Promise<string | Record<string, unknown>>
}

type RendererApi = {
  selectNetworkInterface: (names: string[]) => Promise<{
    interfaces: InterfaceOption[]
    selectedInterfaceNames: string[]
    isCapturing: boolean
  }>
}

export function PrivacyAiPanel(props: {
  packets: PacketMetadata[]
  apps: AppStats[]
  isCapturing: boolean
}): React.JSX.Element {
  const { packets, apps, isCapturing } = props

  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeView, setActiveView] = useState<'session' | 'insights'>('session')
  // Focused app selection for explanations
  const [focusedAppKey, setFocusedAppKey] = useState<string | 'overall'>('overall')

  type StructuredSummary = {
    summary: string
    keyInsights: string
    risk: string
    actions: string
  }

  const [structured, setStructured] = useState<StructuredSummary | null>(null)

  const totalPackets = packets.length
  const totalApps = apps.length

  const geoSummary = useMemo<GeoSummary | null>((): GeoSummary | null => {
    const countryCounts = new Map<string, number>()

    // 1) Primary source: per-app geoLocations (from ApplicationRegistry / ProcessRegistry)
    if (apps && apps.length > 0) {
      for (const app of apps as AppWithGeo[]) {
        const geoLocations = app.geoLocations
        if (!geoLocations || !Array.isArray(geoLocations)) continue

        for (const loc of geoLocations) {
          if (!loc) continue

          const country: string | null =
            (typeof loc.country === 'string' && loc.country) ||
            (typeof loc.regionName === 'string' && loc.regionName) ||
            (typeof loc.region === 'string' && loc.region) ||
            (typeof loc.city === 'string' && loc.city) ||
            null

          if (!country) continue

          const count =
            typeof loc.packetCount === 'number' && loc.packetCount > 0 ? loc.packetCount : 1

          countryCounts.set(country, (countryCounts.get(country) ?? 0) + count)
        }
      }
    }

    // 2) Fallback: infer from packet metadata if no geoLocations were available
    if (countryCounts.size === 0 && packets && packets.length > 0) {
      for (const pkt of packets as PacketWithGeo[]) {
        const country =
          pkt.geo?.country ?? pkt.destinationCountry ?? pkt.country ?? pkt.dstCountry ?? null

        if (!country) continue
        countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1)
      }
    }

    if (countryCounts.size === 0) return null

    const topCountries = Array.from(countryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([country, count]) => ({ country, count }))

    const totalFlows = Array.from(countryCounts.values()).reduce((acc, n) => acc + n, 0)

    return {
      topCountries,
      totalFlows
    }
  }, [apps, packets])

  // Top 5 apps by totalBytes
  const topApps = useMemo<AppStats[]>((): AppStats[] => {
    if (apps.length === 0) return []
    return [...apps].sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 5)
  }, [apps])

  // Focused app object from selection
  const focusedApp = useMemo<AppStats | null>((): AppStats | null => {
    if (focusedAppKey === 'overall') return null
    return topApps.find((app) => `${app.name}-${app.pid ?? 'N/A'}` === focusedAppKey) ?? null
  }, [focusedAppKey, topApps])

  // Top app (most traffic), reuse topApps if available
  const topApp = useMemo<AppStats | null>((): AppStats | null => {
    if (topApps.length > 0) return topApps[0]
    if (apps.length === 0) return null
    return [...apps].sort((a, b) => b.totalBytes - a.totalBytes)[0]
  }, [apps, topApps])

  const severityBadge = useMemo<{ label: string; className: string }>((): {
    label: string
    className: string
  } => {
    if (!isCapturing || totalPackets === 0) {
      return { label: 'Idle', className: 'bg-muted text-muted-foreground' }
    }
    if (totalPackets < 50) {
      return { label: 'Normal', className: 'bg-emerald-50 text-emerald-700' }
    }
    if (totalPackets < 200) {
      return { label: 'Elevated', className: 'bg-amber-50 text-amber-700' }
    }
    return { label: 'Busy', className: 'bg-red-50 text-red-700' }
  }, [isCapturing, totalPackets])

  const parseAiSummary = useCallback((text: string): StructuredSummary => {
    const cleaned = text.replace(/\*\*/g, '').trim()

    const summaryMatch = cleaned.match(/Summary:\s*([^]*?)(?=Key insights:|$)/i)
    const insightsMatch = cleaned.match(/Key insights:\s*([^]*?)(?=Overall risk:|$)/i)
    const riskMatch = cleaned.match(/Overall risk:\s*([A-Za-z]+)/i)
    const actionsMatch = cleaned.match(/Recommended actions:\s*([^]*$)/i)

    const summaryRaw = (summaryMatch?.[1] ?? '').trim()
    const insightsRaw = (insightsMatch?.[1] ?? '').trim()
    const riskRaw = (riskMatch?.[1] ?? 'Unknown').trim()
    const actionsRaw = (actionsMatch?.[1] ?? '').trim()

    const summaryShort =
      summaryRaw.length > 420 ? summaryRaw.slice(0, 417).trimEnd() + '…' : summaryRaw

    return {
      summary: summaryShort,
      keyInsights: insightsRaw,
      risk: riskRaw,
      actions: actionsRaw
    }
  }, [])

  useEffect(() => {
    if (!aiSummary) {
      setStructured(null)
      return
    }
    const next = parseAiSummary(aiSummary)
    setStructured(next)
  }, [aiSummary, parseAiSummary])

  useEffect((): void => {
    // Auto-run once when we have enough packet data and no summary yet.
    if (isLoading) return
    if (totalPackets === 0) return
    if (structured) return
    void handleGenerateSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPackets])

  useEffect((): void => {
    // Auto-trigger AI when there is packet data and the focus changes.
    // Do not spam if already loading.
    if (isLoading) return
    if (totalPackets === 0) return
    // If there is no summary yet, or user changed focus, trigger a new run.
    void handleGenerateSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedAppKey])

  async function handleGenerateSummary(): Promise<void> {
    try {
      setIsLoading(true)
      // Clear previous AI result so the panel shows a clean placeholder
      setAiSummary(null)
      setStructured(null)
      const api = (window as unknown as { api?: PrivacyApi }).api

      const primaryAppName = focusedApp?.name || topApp?.name || 'Unknown'
      const makeFallback = (): string =>
        `Monitoring ${totalApps} app${totalApps === 1 ? '' : 's'} with ${totalPackets.toLocaleString()} packet${
          totalPackets === 1 ? '' : 's'
        }. Top focus: ${primaryAppName}.`

      if (!api || typeof api.getPrivacySummary !== 'function') {
        setAiSummary(makeFallback())
        return
      }

      const totalBytesAllApps = apps.reduce((acc, app) => acc + app.totalBytes, 0)

      const snapshot = {
        // Overall session metrics
        totalPackets,
        totalApps,
        totalBytes: totalBytesAllApps,
        // Top apps for context
        topApps: topApps.map((app) => ({
          name: app.name,
          totalBytes: app.totalBytes,
          pid: app.pid ?? null
        })),
        // Focused app hints for the backend (both simple and structured forms)
        focusAppName: focusedApp?.name,
        focusAppBytes: focusedApp?.totalBytes,
        focusApp: focusedApp
          ? {
              name: focusedApp.name,
              totalBytes: focusedApp.totalBytes,
              pid: focusedApp.pid ?? null
            }
          : null,
        // Lightweight geolocation context for Privacy AI (if available)
        geo: geoSummary
      }

      const result = await api.getPrivacySummary(snapshot)

      if (typeof result === 'string') {
        // backend returns a fully formatted string
        setAiSummary(result)
      } else if (result && typeof result === 'object') {
        // backend may return a structured object; normalize it
        const summary = (result.summary ?? result.overview ?? result.sessionSummary ?? '') as string

        const keyInsights = (result.keyInsights ??
          result.key_insights ??
          result.insights ??
          '') as string

        const risk = (result.risk ??
          result.overallRisk ??
          result.overall_risk ??
          'Unknown') as string

        let actions = ''
        const rawActions = (result.recommendedActions ??
          result.recommended_actions ??
          result.actions) as unknown

        if (Array.isArray(rawActions)) {
          actions = (rawActions as string[]).join(' ')
        } else if (typeof rawActions === 'string') {
          actions = rawActions
        }

        const combined = `Summary: ${summary || 'Not available.'}
Key insights: ${keyInsights || 'Not available.'}
Overall risk: ${risk || 'Unknown'}
Recommended actions: ${actions || 'No specific actions suggested.'}`

        setAiSummary(combined)
      } else {
        // fall back to a plain-text snapshot
        setAiSummary(makeFallback())
      }
    } catch (err) {
      console.error('Failed to generate privacy summary', err)
      setAiSummary(
        (() => {
          const primaryAppName = focusedApp?.name || topApp?.name || 'Unknown'
          return `Monitoring ${totalApps} app${totalApps === 1 ? '' : 's'} with ${totalPackets.toLocaleString()} packet${
            totalPackets === 1 ? '' : 's'
          }. Top focus: ${primaryAppName}.`
        })()
      )
    } finally {
      setIsLoading(false)
    }
  }

  const summaryText = structured?.summary ?? ''
  const riskText = structured?.risk ?? ''
  const actionsText = structured?.actions ?? ''

  // geolocation destinations summary
  const geoDestinationsText = useMemo<string>((): string => {
    if (!geoSummary || !Array.isArray(geoSummary.topCountries)) return ''
    if (geoSummary.topCountries.length === 0) return ''

    const parts = geoSummary.topCountries.map((entry) => {
      const country = String(entry.country ?? 'Unknown')
      const count = typeof entry.count === 'number' ? entry.count : undefined
      return count !== undefined ? `${country} (${count} flows)` : country
    })

    const base = parts.join(', ')
    if (typeof geoSummary.totalFlows === 'number') {
      return `${base} — ${geoSummary.totalFlows.toLocaleString()} geo‑identified flows in total`
    }
    return base
  }, [geoSummary])

  return (
    <div className="flex flex-col min-h-0 rounded-xl border bg-card p-4">
      {/* View toggle: Current session | Key insights */}
      <div className="mb-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveView('session')}
          className={`rounded-full border px-2 py-0.5 text-[10px] ${
            activeView === 'session'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground'
          }`}
        >
          Current session
        </button>
        <button
          type="button"
          onClick={() => setActiveView('insights')}
          className={`rounded-full border px-2 py-0.5 text-[10px] ${
            activeView === 'insights'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground'
          }`}
        >
          Key insights
        </button>
      </div>

      {/* CURRENT SESSION VIEW */}
      {activeView === 'session' && (
        <div className="mt-1 space-y-2 text-xs text-muted-foreground">
          <p>
            Monitoring current session. Detected{' '}
            <span className="font-medium text-foreground">
              {totalApps} active app{totalApps === 1 ? '' : 's'}
            </span>{' '}
            across{' '}
            <span className="font-medium text-foreground">
              {totalPackets.toLocaleString()} packet
              {totalPackets === 1 ? '' : 's'}
            </span>
            .
          </p>
          {topApp ? (
            <p>
              Top application:{' '}
              <span className="font-medium text-foreground">{topApp.name || 'Unknown'}</span> with{' '}
              <span className="font-medium text-foreground">
                {topApp.totalBytes.toLocaleString()} bytes
              </span>{' '}
              sent.
            </p>
          ) : (
            <p>No active apps observed yet.</p>
          )}
          {geoDestinationsText && (
            <p>
              Traffic destinations (from geolocation):{' '}
              <span className="font-medium text-foreground">{geoDestinationsText}</span>.
            </p>
          )}

          <div className="mt-2 rounded-md border bg-background px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">AI overview</span>
            </div>

            {/* App focus selector pills */}
            {topApps.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setFocusedAppKey('overall')}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    focusedAppKey === 'overall'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground'
                  }`}
                >
                  Overall session
                </button>
                {topApps.map((app) => {
                  const key = `${app.name}-${app.pid ?? 'N/A'}`
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFocusedAppKey(key)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        focusedAppKey === key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground'
                      }`}
                    >
                      {app.name || 'Unknown'}
                    </button>
                  )
                })}
              </div>
            )}

            {structured ? (
              <div className="mt-1 space-y-2 text-[11px] leading-relaxed">
                <div>
                  <span className="font-semibold text-foreground">Summary: </span>
                  <span>{summaryText}</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Overall risk: </span>
                  <span>{riskText}</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Recommended actions: </span>
                  <span>{actionsText}</span>
                </div>
              </div>
            ) : (
              <div className="mt-1 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                <div>
                  <span className="font-semibold text-foreground">Summary: </span>
                  <span>{isLoading ? 'Preparing summary…' : 'No summary yet.'}</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Overall risk: </span>
                  <span>{isLoading ? 'Evaluating risk…' : 'Not evaluated yet.'}</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Recommended actions: </span>
                  <span>{isLoading ? 'Analysing actions…' : 'No actions yet.'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KEY INSIGHTS VIEW */}
      {activeView === 'insights' && (
        <div className="mt-1 space-y-2 text-xs text-muted-foreground">
          <p className="text-[11px] font-medium text-muted-foreground">
            Key observations for this capture:
          </p>
          <ul className="space-y-1">
            <li>
              Overall activity level:{' '}
              <span className="font-medium text-foreground">{severityBadge.label}</span>.
            </li>
            <li>
              Number of active applications:{' '}
              <span className="font-medium text-foreground">{totalApps}</span>.
            </li>
            <li>
              Total packets observed:{' '}
              <span className="font-medium text-foreground">{totalPackets.toLocaleString()}</span>.
            </li>
            {topApp && (
              <li>
                Highest traffic from:{' '}
                <span className="font-medium text-foreground">{topApp.name || 'Unknown'}</span>.
              </li>
            )}
            {structured && structured.keyInsights && (
              <li>
                AI insights: <span className="text-foreground">{structured.keyInsights}</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export function AdvancedNetworkMonitor({
  handleAdvancedModeChange,
  packets,
  packetCount,
  totalBytes,
  bytesPerSecond,
  selectedInterfaces,
  darkMode,
  isCapturing,
  handleToggleCapture,
  isUpdatingCapture,
  setSelectedInterfaces,
  setInterfaces,
  setIsCapturing,
  appStatsMap,
  interfaces
}: {
  handleAdvancedModeChange: () => void
  packetCount: number
  totalBytes: number
  bytesPerSecond: number
  selectedInterfaces: string[]
  darkMode: boolean
  isCapturing: boolean
  handleToggleCapture: () => void
  isUpdatingCapture: boolean
  setSelectedInterfaces: React.Dispatch<React.SetStateAction<string[]>>
  setInterfaces: React.Dispatch<React.SetStateAction<InterfaceOption[]>>
  setIsCapturing: React.Dispatch<React.SetStateAction<boolean>>
  setAppStatsMap: React.Dispatch<React.SetStateAction<Record<string, AppStats>>>
  appStatsMap: Record<string, AppStats>
  interfaces: InterfaceOption[]
  packets: PacketMetadata[]
}): React.JSX.Element {
  const [isSwitchingInterface, setIsSwitchingInterface] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(false)

  const handleInterfaceChange = async (nextSelection: string[]): Promise<void> => {
    setIsSwitchingInterface(true)
    try {
      const api = (window as unknown as { api: RendererApi }).api
      const result = await api.selectNetworkInterface(nextSelection)
      setInterfaces(result.interfaces)
      setSelectedInterfaces(result.selectedInterfaceNames)
      setIsCapturing(result.isCapturing)
    } catch (err) {
      console.error('Interface selection failed', err)
    } finally {
      setIsSwitchingInterface(false)
    }
  }
  // Derived State
  const appStats = useMemo((): AppStats[] => {
    return Object.values(appStatsMap).sort((a, b) => b.packetCount - a.packetCount)
  }, [appStatsMap])
  // Formatters
  const formatRate = (bps: number): string => {
    if (bps < 1024) return `${bps.toFixed(0)} B/s`
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  }

  const formatTotal = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Network Monitor - Advanced Mode</h1>
          <p className="text-muted-foreground">Real-time packet analysis and app insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className={showSettings ? 'bg-accent' : ''}
          >
            <Settings2 className="mr-2 h-4 w-4" />
            Interfaces
          </Button>
          <Button variant="outline" size="sm" onClick={handleAdvancedModeChange}>
            <Baby className="mr-2 h-4 w-4" />
            Basic Mode
          </Button>
          <Button
            variant={aiEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAiEnabled((prev) => !prev)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            AI mode
          </Button>
          <Button
            onClick={handleToggleCapture}
            disabled={isUpdatingCapture || isSwitchingInterface || interfaces.length === 0}
            variant={isCapturing ? 'destructive' : 'default'}
            className="w-32"
          >
            {isUpdatingCapture ? (
              'Updating...'
            ) : isCapturing ? (
              <>
                <Pause className="mr-2 h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Start
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Interface Settings (Collapsible) */}
      {showSettings && (
        <div className="shrink-0 animate-in slide-in-from-top-2 fade-in duration-200">
          <InterfaceSelector
            interfaces={interfaces}
            selectedInterfaces={selectedInterfaces}
            isCapturing={isCapturing}
            isSwitching={isSwitchingInterface}
            onToggle={(name, checked) => {
              const next = checked
                ? [...selectedInterfaces, name]
                : selectedInterfaces.filter((n) => n !== name)
              if (next.length > 0) handleInterfaceChange(next)
            }}
            onSelectAll={() => {
              handleInterfaceChange(interfaces.map((i) => i.name))
            }}
          />
        </div>
      )}

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 shrink-0">
        <StatCard
          title="Throughput"
          value={formatRate(bytesPerSecond)}
          description="Current bandwidth usage"
          icon={Activity}
        />
        <StatCard
          title="Total Data"
          value={formatTotal(totalBytes)}
          description="Since session start"
          icon={Database}
        />
        <StatCard
          title="Packets"
          value={packetCount.toLocaleString()}
          description="Total captured packets"
          icon={Globe}
        />
        <StatCard
          title="Active Apps"
          value={appStats.length}
          description="Apps communicating"
          icon={Activity}
        />
      </div>

      {/* Privacy AI Panel */}
      {aiEnabled && (
        <div className="shrink-0">
          <PrivacyAiPanel packets={packets} apps={appStats} isCapturing={isCapturing} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid gap-4 md:grid-cols-7 flex-1 min-h-0 overflow-auto">
        {/* Left: App Insights (4 cols) */}
        <div className="md:col-span-4 flex flex-col min-h-0">
          <ActivityList packets={packets} className="flex-1 flex flex-col min-h-0" />
        </div>

        {/* Right: Live Packet Feed (3 cols) -> Swapped, actually ActivityList is packets. AppInsights is apps. */}
        {/* Let's swap: ActivityList (Live) on left/bottom? No, maybe side by side. */}
        {/* The user wants "Map" too. I don't have a map component yet. */}
        {/* I'll put AppInsights on the right side as a summary, and Packet List on the left as main feed. */}

        <div className="md:col-span-3 flex flex-col min-h-0 gap-4">
          <ExportReports darkMode={darkMode} />
          <AppInsights apps={appStats} />
        </div>
      </div>
    </div>
  )
}
export default AdvancedNetworkMonitor
