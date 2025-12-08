import * as React from 'react'
import { Activity, Database, Globe, Play, Pause, Settings2, Baby } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Button } from './ui/button'
import { StatCard } from './StatCard'
import { InterfaceSelector } from './InterfaceSelector'
// import { AppInsights } from './AppInsights'
import { ActivityList } from './ActivityList'
import ExportReports from './ExportReports'
import { AppInsights } from './AppInsights'
import { AppStats, InterfaceOption } from '@renderer/types'
import { PacketMetadata } from '../types'

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
  // Derived State
  const appStats = useMemo(() => {
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

        <div className="md:col-span-3 flex flex-col min-h-0 gap-4">
          <ExportReports darkMode={darkMode} />
          <AppInsights apps={appStats} />
        </div>
      </div>
    </div>
  )
}
export default AdvancedNetworkMonitor
