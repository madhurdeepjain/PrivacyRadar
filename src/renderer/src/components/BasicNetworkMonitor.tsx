import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { Play, Pause } from 'lucide-react'
import { Button } from './ui/button'
// import Visualization from './Visualization'
import { InterfaceOption } from '../types'
import GlobalMap from './GlobalMap'
import { ProcessList } from './ProcessList'

export function BasicNetworkMonitor(): React.JSX.Element {
  // State
  const throughputSamplesRef = useRef<Array<{ timestamp: number; size: number }>>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [isUpdatingCapture, setIsUpdatingCapture] = useState(false)
  const [interfaces, setInterfaces] = useState<InterfaceOption[]>([])

  // API: Initialize Interfaces
  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        const result = await window.api.getNetworkInterfaces()
        setInterfaces(result.interfaces)
        setIsCapturing(result.isCapturing)
      } catch (err) {
        console.error('Failed to load interfaces', err)
      }
    }
    init()
  }, [])

  // Actions
  const handleToggleCapture = async (): Promise<void> => {
    setIsUpdatingCapture(true)
    try {
      const result = isCapturing ? await window.api.stopCapture() : await window.api.startCapture()
      setIsCapturing(result.isCapturing)
      if (!result.isCapturing) {
        throughputSamplesRef.current = []
      }
    } catch (err) {
      console.error('Capture toggle failed', err)
    } finally {
      setIsUpdatingCapture(false)
    }
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Network Monitor - Baisc Mode</h1>
          <p className="text-muted-foreground">Real-time packet analysis and app insights</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Main Content Area */}
      <div className="grid gap-4 md:grid-cols-7 flex-1 min-h-0">
        {/* Left: App Insights (4 cols) */}
        <div className="md:col-span-4 flex flex-col min-h-0 gap-4">
          <GlobalMap />
          <ProcessList />
        </div>

        {/* Right: Live Packet Feed (3 cols) -> Swapped, actually ActivityList is packets. AppInsights is apps. */}
        {/* Let's swap: ActivityList (Live) on left/bottom? No, maybe side by side. */}
        {/* The user wants "Map" too. I don't have a map component yet. */}
        {/* I'll put AppInsights on the right side as a summary, and Packet List on the left as main feed. */}

        <div className="md:col-span-3 flex flex-col min-h-0">{/* <Visualization /> */}</div>
      </div>
    </div>
  )
}
export default BasicNetworkMonitor
