import { motion, AnimatePresence } from 'framer-motion'
import AdvancedNetworkMonitor from './AdvancedNetworkMonitor'
import BasicNetworkMonitor from './BasicNetworkMonitor'
import { useState, useEffect, useRef } from 'react'
import { PacketMetadata, AppStats, InterfaceOption, ProcessRegistry } from '../types'

function NetworkMonitor({
  colorAccessibility,
  handleAdvancedModeChange,
  maxPackets,
  advancedMode,
  darkMode
}: {
  handleAdvancedModeChange: () => void
  colorAccessibility: boolean
  maxPackets: number
  advancedMode: boolean
  darkMode: boolean
}): React.JSX.Element {
  const [packets, setPackets] = useState<PacketMetadata[]>([])
  const [packetCount, setPacketCount] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [appStatsMap, setAppStatsMap] = useState<Record<string, AppStats>>({})
  const [bytesPerSecond, setBytesPerSecond] = useState(0)
  const throughputSamplesRef = useRef<Array<{ timestamp: number; size: number }>>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [isUpdatingCapture, setIsUpdatingCapture] = useState(false)
  const [interfaces, setInterfaces] = useState<InterfaceOption[]>([])
  const [selectedInterfaces, setSelectedInterfaces] = useState<string[]>([])
  const [registries, setRegistries] = useState<Array<Map<string, ProcessRegistry>>>(
    new Array<Map<string, ProcessRegistry>>(new Map())
  )
  const [location, setLocation] = useState(null)

  useEffect(() => {
    window.api.onProcessRegistryData((data: Map<string, ProcessRegistry>) => {
      if (!location) {
        window.api.getPublicIP().then((publicIp) => {
          window.api.getGeoLocation(publicIp).then((loc) => {
            setLocation(loc)
          })
        })
      }
      if (data) {
        setRegistries([...registries, data])
      }
    })
  }, [location, registries])

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

  useEffect(() => {
    const handleData = (data: PacketMetadata): void => {
      setPacketCount((p) => p + 1)
      setPackets((prev) => [data, ...prev].slice(0, maxPackets))
      setTotalBytes((p) => p + data.size)

      setAppStatsMap((prev) => {
        const appName = data.appName || 'UNKNOWN'
        const key = appName
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

      const now = data.timestamp
      const samples = throughputSamplesRef.current
      samples.push({ timestamp: now, size: data.size })

      const windowStart = now - 30000
      while (samples.length > 0 && samples[0].timestamp < windowStart) {
        samples.shift()
      }

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
  }, [maxPackets])

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

  return (
    <main className="flex-1 flex flex-col overflow-hidden relative bg-muted/10">
      <AnimatePresence mode="wait">
        <motion.div
          key={advancedMode.toString()}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="h-full flex flex-col overflow-hidden"
        >
          {advancedMode ? (
            <AdvancedNetworkMonitor
              handleAdvancedModeChange={handleAdvancedModeChange}
              packets={packets}
              packetCount={packetCount}
              totalBytes={totalBytes}
              bytesPerSecond={bytesPerSecond}
              selectedInterfaces={selectedInterfaces}
              darkMode={darkMode}
              isCapturing={isCapturing}
              handleToggleCapture={handleToggleCapture}
              isUpdatingCapture={isUpdatingCapture}
              setSelectedInterfaces={setSelectedInterfaces}
              setInterfaces={setInterfaces}
              setIsCapturing={setIsCapturing}
              appStatsMap={appStatsMap}
              setAppStatsMap={setAppStatsMap}
              interfaces={interfaces}
            />
          ) : (
            <BasicNetworkMonitor
              colorAccessibility={colorAccessibility}
              handleAdvancedModeChange={handleAdvancedModeChange}
              packets={packets}
              location={location}
              registries={registries}
              handleToggleCapture={handleToggleCapture}
              isUpdatingCapture={isUpdatingCapture}
              isCapturing={isCapturing}
              interfaces={interfaces}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  )
}

export default NetworkMonitor
