import * as React from 'react'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Activity, Database, Globe, Play, Pause, Settings2 } from 'lucide-react'
import { Button } from './ui/button'
import { StatCard } from './StatCard'
import { InterfaceSelector } from './InterfaceSelector'
import { AppInsights } from './AppInsights'
import { ActivityList } from './ActivityList'
import { PacketData, AppStats, InterfaceOption } from '../types'

export function NetworkMonitor(): React.JSX.Element {
  // State
  const [packets, setPackets] = useState<PacketData[]>([])
  const [packetCount, setPacketCount] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [appStatsMap, setAppStatsMap] = useState<Record<string, AppStats>>({})
  const [bytesPerSecond, setBytesPerSecond] = useState(0)
  const throughputSamplesRef = useRef<Array<{ timestamp: number; size: number }>>([])

  const [isCapturing, setIsCapturing] = useState(false)
  const [isUpdatingCapture, setIsUpdatingCapture] = useState(false)

  const [interfaces, setInterfaces] = useState<InterfaceOption[]>([])
  const [selectedInterfaces, setSelectedInterfaces] = useState<string[]>([])
  const [isSwitchingInterface, setIsSwitchingInterface] = useState(false)

  const [showSettings, setShowSettings] = useState(false)

  // Derived State
  const appStats = useMemo(() => {
    return Object.values(appStatsMap).sort((a, b) => b.packetCount - a.packetCount)
  }, [appStatsMap])

  // API: Initialize Interfaces
  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        const result = await window.api.getNetworkInterfaces()
        setInterfaces(result.interfaces)
        setSelectedInterfaces(
          result.selectedInterfaceNames.length > 0
            ? result.selectedInterfaceNames
            : result.interfaces.map((i) => i.name)
        )
        setIsCapturing(result.isCapturing)
      } catch (err) {
        console.error('Failed to load interfaces', err)
      }
    }
    init()
  }, [])

  // API: Network Data Listener
  useEffect(() => {
    const handleData = (data: PacketData): void => {
      setPacketCount((p) => p + 1)
      setPackets((prev) => [data, ...prev].slice(0, 500))
      setTotalBytes((p) => p + data.size)

      // App Stats
      setAppStatsMap((prev) => {
        const appName = data.procName || 'UNKNOWN'
        const key = `${appName}-${data.pid ?? 'N/A'}`
        const existing = prev[key]

        if (existing) {
          return {
            ...prev,
            [key]: {
              ...existing,
              packetCount: existing.packetCount + 1,
              totalBytes: existing.totalBytes + data.size,
              lastSeen: Math.max(existing.lastSeen, data.timestamp)
            }
          }
        }
        return {
          ...prev,
          [key]: {
            name: appName,
            pid: data.pid,
            packetCount: 1,
            totalBytes: data.size,
            lastSeen: data.timestamp
          }
        }
      })

      // Throughput
      const now = data.timestamp
      const samples = throughputSamplesRef.current
      samples.push({ timestamp: now, size: data.size })

      // Cleanup old samples (30s window)
      const windowStart = now - 30000
      while (samples.length > 0 && samples[0].timestamp < windowStart) {
        samples.shift()
      }

      // Calculate rate
      if (samples.length > 0) {
        const recentBytes = samples.reduce((acc, s) => acc + s.size, 0)
        const span = Math.max(1, (now - samples[0].timestamp) / 1000)
        setBytesPerSecond(recentBytes / span)
      } else {
        setBytesPerSecond(0)
      }
    }

    window.api.onNetworkData(handleData)
    return () => {
      window.api.removeNetworkDataListener()
    }
  }, [])

  // Throughput Decay Interval
  useEffect(() => {
    const interval = setInterval(() => {
      const samples = throughputSamplesRef.current
      if (samples.length === 0) {
        setBytesPerSecond((b) => (b > 0 ? 0 : b))
        return
      }
      const now = Date.now()
      const windowStart = now - 30000
      while (samples.length > 0 && samples[0].timestamp < windowStart) {
        samples.shift()
      }
      if (samples.length === 0) {
        setBytesPerSecond(0)
      } else {
        const recentBytes = samples.reduce((acc, s) => acc + s.size, 0)
        const span = Math.max(1, (now - samples[0].timestamp) / 1000)
        setBytesPerSecond(recentBytes / span)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Actions
  const handleToggleCapture = async (): Promise<void> => {
    setIsUpdatingCapture(true)
    try {
      const result = isCapturing ? await window.api.stopCapture() : await window.api.startCapture()
      setIsCapturing(result.isCapturing)
      if (!result.isCapturing) {
        setBytesPerSecond(0)
        throughputSamplesRef.current = []
      }
    } catch (err) {
      console.error('Capture toggle failed', err)
    } finally {
      setIsUpdatingCapture(false)
    }
  }

  const handleInterfaceChange = async (nextSelection: string[]): Promise<void> => {
    setIsSwitchingInterface(true)
    try {
      const result = await window.api.selectNetworkInterface(nextSelection)
      setInterfaces(result.interfaces)
      setSelectedInterfaces(result.selectedInterfaceNames)
      setIsCapturing(result.isCapturing)
    } catch (err) {
      console.error('Interface selection failed', err)
    } finally {
      setIsSwitchingInterface(false)
    }
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Network Monitor</h1>
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

      {/* Main Content Area */}
      <div className="grid gap-4 md:grid-cols-7 flex-1 min-h-0">
        {/* Left: App Insights (4 cols) */}
        <div className="md:col-span-4 flex flex-col min-h-0">
          <ActivityList packets={packets} className="flex-1 flex flex-col min-h-0" />
        </div>

        {/* Right: Live Packet Feed (3 cols) -> Swapped, actually ActivityList is packets. AppInsights is apps. */}
        {/* Let's swap: ActivityList (Live) on left/bottom? No, maybe side by side. */}
        {/* The user wants "Map" too. I don't have a map component yet. */}
        {/* I'll put AppInsights on the right side as a summary, and Packet List on the left as main feed. */}

        <div className="md:col-span-3 flex flex-col min-h-0">
          <AppInsights apps={appStats} />
        </div>
      </div>
    </div>
  )
}
