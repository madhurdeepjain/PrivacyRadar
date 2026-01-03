import * as React from 'react'
import { Play, Pause, Zap, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import Visualization from './Visualization'
import { InterfaceOption, ProcessRegistry, AppStats } from '../types'
import GlobalMap from './GlobalMap'
import { ProcessList } from './ProcessList'
import { PacketMetadata } from 'src/preload/preload'
import { useState, useMemo } from 'react'
import { PrivacyAiPanel } from './AdvancedNetworkMonitor'

interface BasicNetworkMonitorProps {
  colorAccessibility: boolean
  handleAdvancedModeChange: () => void
  packets: Array<PacketMetadata>
  location: { lat: number; lon: number } | null
  registries: Array<Map<string, ProcessRegistry>>
  handleToggleCapture: () => void
  isUpdatingCapture: boolean
  isCapturing: boolean
  interfaces: InterfaceOption[]
  appStatsMap: Record<string, AppStats>
}

export function BasicNetworkMonitor({
  colorAccessibility,
  handleAdvancedModeChange,
  packets,
  location,
  registries,
  handleToggleCapture,
  isUpdatingCapture,
  isCapturing,
  interfaces,
  appStatsMap
}: BasicNetworkMonitorProps): React.JSX.Element {
  const [aiEnabled, setAiEnabled] = useState(false)
  const appStats = useMemo((): AppStats[] => {
    return Object.values(appStatsMap).sort((a, b) => b.packetCount - a.packetCount)
  }, [appStatsMap])

  return (
    <div className="flex flex-col h-full space-y-4 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Network Monitor - Basic Mode</h1>
          <p className="text-muted-foreground">Real-time packet analysis and app insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAdvancedModeChange}>
            <Zap className="mr-2 h-4 w-4" />
            Advanced Mode
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
            disabled={isUpdatingCapture || interfaces.length === 0}
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

      {/* Privacy AI Panel */}
      {aiEnabled && (
        <div className="shrink-0">
          <PrivacyAiPanel packets={packets} apps={appStats} isCapturing={isCapturing} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid gap-4 md:grid-cols-7 flex-1 min-h-0 overflow-auto">
        {/* Left: App Insights (4 cols) */}
        <div className="md:col-span-4 flex flex-col min-h-0 gap-4">
          <GlobalMap
            colorAccessibility={colorAccessibility}
            registries={registries}
            location={location}
          />
          <ProcessList registries={registries} />
        </div>

        {/* Right: Live Packet Feed (3 cols) -> Swapped, actually ActivityList is packets. AppInsights is apps. */}
        {/* Let's swap: ActivityList (Live) on left/bottom? No, maybe side by side. */}
        {/* The user wants "Map" too. I don't have a map component yet. */}
        {/* I'll put AppInsights on the right side as a summary, and Packet List on the left as main feed. */}

        <div className="md:col-span-3 flex flex-col min-h-0">
          <Visualization
            colorAccessibility={colorAccessibility}
            registries={registries}
            packets={packets}
          />
        </div>
      </div>
    </div>
  )
}
export default BasicNetworkMonitor
