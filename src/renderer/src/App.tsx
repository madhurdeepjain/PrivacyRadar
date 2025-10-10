import { useState, useEffect, useMemo, useRef } from 'react'
import Versions from './components/Versions'
import logo from '../../../resources/icon.png'
import styles from './App.module.css'

interface InterfaceOption {
  name: string
  description: string
  addresses: string[]
  friendlyName?: string
}

type InterfaceSelectionResult = Awaited<ReturnType<(typeof window.api)['getNetworkInterfaces']>>

interface PacketData {
  pid?: number
  procName?: string
  size: number
  srcIP?: string
  dstIP?: string
  srcport?: number
  dstport?: number
  protocol?: string
  timestamp: number
  srcPortService?: string
  dstPortService?: string
  ipv4?: {
    srcaddr: string
    dstaddr: string
  }
  ipv6?: {
    srcaddr: string
    dstaddr: string
  }
  tcp?: {
    srcport: number
    dstport: number
  }
  udp?: {
    srcport: number
    dstport: number
  }
}

interface AppStats {
  name: string
  pid?: number
  packetCount: number
  totalBytes: number
  lastSeen: number
}

function App(): React.JSX.Element {
  const [packets, setPackets] = useState<PacketData[]>([])
  const [packetCount, setPacketCount] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [appStatsMap, setAppStatsMap] = useState<Record<string, AppStats>>({})
  const [lastPacketTimestamp, setLastPacketTimestamp] = useState<number | undefined>(undefined)
  const throughputSamplesRef = useRef<Array<{ timestamp: number; size: number }>>([])
  const [bytesPerSecond, setBytesPerSecond] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isUpdatingCapture, setIsUpdatingCapture] = useState(false)
  const [interfaces, setInterfaces] = useState<InterfaceOption[]>([])
  const [selectedInterface, setSelectedInterface] = useState('')
  const [isSwitchingInterface, setIsSwitchingInterface] = useState(false)
  const [interfaceError, setInterfaceError] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const activityListRef = useRef<HTMLDivElement>(null)

  const resetCaptureState = (): void => {
    setPackets([])
    setPacketCount(0)
    setTotalBytes(0)
    setAppStatsMap({})
    setLastPacketTimestamp(undefined)
    throughputSamplesRef.current = []
    setBytesPerSecond(0)
  }

  const applyInterfaceSelection = (selection: InterfaceSelectionResult): void => {
    setInterfaces(selection.interfaces)
    setSelectedInterface(
      selection.selectedInterfaceName ||
        selection.bestInterfaceName ||
        selection.interfaces[0]?.name ||
        ''
    )
    setIsCapturing(Boolean(selection.isCapturing))
  }

  useEffect(() => {
    const initializeInterfaces = async (): Promise<void> => {
      try {
        const selection = await window.api.getNetworkInterfaces()
        applyInterfaceSelection(selection)
      } catch (error) {
        console.error('Failed to load network interfaces', error)
        setInterfaceError('Unable to load network interfaces')
      }
    }

    void initializeInterfaces()
  }, [])

  useEffect(() => {
    const handleNetworkData = (data: PacketData[]): void => {
      setPacketCount((prev) => prev + 1)
      setPackets((prev) => [...data, ...prev].slice(0, 500)) // Keep last 500 packets
      setTotalBytes((prev) => prev + data.reduce((acc, pkt) => acc + pkt.size, 0))
      setLastPacketTimestamp(data[data.length - 1].timestamp)
      setAppStatsMap((prev) => {
        const next = { ...prev }
        data.forEach((pkt) => {
          const appName = pkt.procName || 'UNKNOWN'
          const key = `${appName}-${pkt.pid ?? 'N/A'}`
          if (next[key]) {
            const existing = next[key]
            next[key] = {
              ...existing,
              packetCount: existing.packetCount + 1,
              totalBytes: existing.totalBytes + pkt.size,
              lastSeen: Math.max(existing.lastSeen, pkt.timestamp)
            }
          } else {
            next[key] = {
              name: appName,
              pid: pkt.pid,
              packetCount: 1,
              totalBytes: pkt.size,
              lastSeen: pkt.timestamp
            }
          }
        })
        return next
      })

      const samples = throughputSamplesRef.current
      const windowStart = data[data.length - 1].timestamp - 30_000
      data.forEach((pkt) => samples.push({ timestamp: pkt.timestamp, size: pkt.size }))
      while (samples.length > 0 && samples[0].timestamp < windowStart) {
        samples.shift()
      }

      if (samples.length === 0) {
        setBytesPerSecond(0)
      } else {
        const recentBytes = samples.reduce((acc, sample) => acc + sample.size, 0)
        const spanSeconds = Math.max(1, (samples[samples.length - 1].timestamp - samples[0].timestamp) / 1000)
        setBytesPerSecond(recentBytes / spanSeconds)
      }
    }

    window.api.onNetworkData(handleNetworkData)
    return () => {
      window.api.removeNetworkDataListener()
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const samples = throughputSamplesRef.current
      if (samples.length === 0) {
        setBytesPerSecond((prev) => (prev !== 0 ? 0 : prev))
        return
      }

      const now = Date.now()
      const windowStart = now - 30_000
      while (samples.length > 0 && samples[0].timestamp < windowStart) {
        samples.shift()
      }

      if (samples.length === 0) {
        setBytesPerSecond((prev) => (prev !== 0 ? 0 : prev))
        return
      }

      const recentBytes = samples.reduce((acc, sample) => acc + sample.size, 0)
      const spanSeconds = Math.max(1, (now - samples[0].timestamp) / 1000)
      setBytesPerSecond(recentBytes / spanSeconds)
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  // Scroll to bottom when packets are rendered
  useEffect(() => {
    if (activityListRef.current && packets.length > 0) {
      activityListRef.current.scrollTop = activityListRef.current.scrollHeight
    }
  }, [packets.length])

  const getSourceIP = (packet: PacketData): string => {
    return packet.srcIP || packet.ipv4?.srcaddr || packet.ipv6?.srcaddr || 'Unknown'
  }

  const getDestIP = (packet: PacketData): string => {
    return packet.dstIP || packet.ipv4?.dstaddr || packet.ipv6?.dstaddr || 'Unknown'
  }

  const getSourcePort = (packet: PacketData): number | string => {
    return packet.srcport || packet.tcp?.srcport || packet.udp?.srcport || 'N/A'
  }

  const getDestPort = (packet: PacketData): number | string => {
    return packet.dstport || packet.tcp?.dstport || packet.udp?.dstport || 'N/A'
  }

  const appStats = useMemo(() => {
    return Object.values(appStatsMap).sort((a, b) => b.packetCount - a.packetCount)
  }, [appStatsMap])

  const summary = useMemo(() => {
    return {
      totalBytes,
      uniqueApps: Object.keys(appStatsMap).length,
      bytesPerSecond: Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0,
      lastPacketTimestamp
    }
  }, [totalBytes, appStatsMap, bytesPerSecond, lastPacketTimestamp])

  const topApps = useMemo(() => appStats.slice(0, 8), [appStats])

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatRate = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  }

  const formatTimeAgo = (timestamp?: number): string => {
    if (!timestamp) return 'Awaiting data'

    const diff = Date.now() - timestamp

    if (diff < 1_000) return 'Just now'
    if (diff < 60_000) return `${Math.round(diff / 1_000)}s ago`
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`

    return new Date(timestamp).toLocaleTimeString()
  }

  const handleInterfaceChange = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ): Promise<void> => {
    const nextInterface = event.target.value
    setSelectedInterface(nextInterface)
    setIsSwitchingInterface(true)
    setInterfaceError(null)
    setCaptureError(null)

    try {
      const selection = await window.api.selectNetworkInterface(nextInterface)
      applyInterfaceSelection(selection)
      resetCaptureState()
    } catch (error) {
      console.error('Failed to switch network interface', error)
      setInterfaceError('Unable to switch interface')
    } finally {
      setIsSwitchingInterface(false)
    }
  }

  const handleToggleCapture = async (): Promise<void> => {
    setCaptureError(null)
    setIsUpdatingCapture(true)

    try {
      const selection = isCapturing
        ? await window.api.stopCapture()
        : await window.api.startCapture()

      applyInterfaceSelection(selection)

      if (!selection.isCapturing) {
        // When capture stops we keep the existing state so insights remain visible.
        throughputSamplesRef.current = []
        setBytesPerSecond(0)
      }
    } catch (error) {
      console.error('Failed to toggle capture state', error)
      setCaptureError(isCapturing ? 'Unable to pause capture' : 'Unable to start capture')
    } finally {
      setIsUpdatingCapture(false)
    }
  }

  const renderInterfaceOptionLabel = (iface: InterfaceOption): string => {
    const primaryLabel = iface.friendlyName || iface.description || iface.name
    const detailParts: string[] = []

    if (iface.friendlyName && iface.friendlyName !== iface.name) {
      detailParts.push(iface.name)
    } else if (!iface.friendlyName && iface.description && iface.description !== iface.name) {
      detailParts.push(iface.name)
    }

    if (iface.addresses.length > 0) {
      detailParts.push(iface.addresses.join(', '))
    }

    if (detailParts.length === 0) {
      return primaryLabel
    }

    return `${primaryLabel} (${detailParts.join(' · ')})`
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <img alt="PrivacyRadar" className={styles.brandMark} src={logo} />
          <div>
            <h1 className={styles.brandTitle}>PrivacyRadar</h1>
            <p className={styles.brandSubtitle}>Real-time network intelligence</p>
          </div>
        </div>
        <div className={styles.capturePanel}>
          <div className={styles.interfaceSelector}>
            <label className={styles.interfaceLabel} htmlFor="interface-select">
              Capturing on
            </label>
            <select
              id="interface-select"
              className={styles.interfaceSelect}
              value={selectedInterface}
              onChange={handleInterfaceChange}
              disabled={interfaces.length === 0 || isSwitchingInterface || isUpdatingCapture}
            >
              {interfaces.length === 0 ? (
                <option value="">No interfaces available</option>
              ) : (
                interfaces.map((iface) => (
                  <option key={iface.name} value={iface.name}>
                    {renderInterfaceOptionLabel(iface)}
                  </option>
                ))
              )}
            </select>
            {isSwitchingInterface && (
              <span className={styles.interfaceStatus}>Switching interface...</span>
            )}
            {interfaceError && <span className={styles.interfaceError}>{interfaceError}</span>}
          </div>
          <div className={styles.captureControls}>
            <button
              type="button"
              className={`${styles.captureButton} ${
                isCapturing ? styles.captureButtonPause : styles.captureButtonStart
              }`}
              onClick={handleToggleCapture}
              disabled={interfaces.length === 0 || isSwitchingInterface || isUpdatingCapture}
            >
              {isUpdatingCapture
                ? isCapturing
                  ? 'Pausing capture...'
                  : 'Starting capture...'
                : isCapturing
                  ? 'Pause capture'
                  : 'Start capture'}
            </button>
            <span className={styles.captureHint}>
              {isUpdatingCapture
                ? isCapturing
                  ? 'Pausing capture'
                  : 'Starting capture'
                : isCapturing
                  ? 'Capturing live traffic'
                  : 'Capture paused'}
            </span>
            {captureError && <span className={styles.captureError}>{captureError}</span>}
          </div>
        </div>
        <div className={`${styles.liveBadge} ${!isCapturing ? styles.liveBadgePaused : ''}`}>
          <span
            className={`${styles.liveDot} ${!isCapturing ? styles.liveDotPaused : ''}`}
            aria-hidden
          />
          {isUpdatingCapture
            ? 'Updating capture...'
            : isCapturing
              ? packets.length > 0
                ? 'Streaming now'
                : 'Capturing...'
              : 'Capture paused'}
        </div>
      </header>

      <section className={styles.metricStrip}>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Total packets captured</span>
          <span className={styles.metricValue}>{packetCount.toLocaleString()}</span>
          <span className={styles.metricHint}>
            Last update {formatTimeAgo(summary.lastPacketTimestamp)}
          </span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Active applications</span>
          <span className={styles.metricValue}>{summary.uniqueApps.toLocaleString()}</span>
          <span className={styles.metricHint}>Since capture started</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Throughput (30s avg)</span>
          <span className={styles.metricValue}>{formatRate(summary.bytesPerSecond)}</span>
          <span className={styles.metricHint}>Recent transfer rate</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Data observed</span>
          <span className={styles.metricValue}>{formatBytes(summary.totalBytes)}</span>
          <span className={styles.metricHint}>Since capture started</span>
        </article>
      </section>

      <main className={styles.dashboardGrid}>
        <section className={styles.activityCard}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Live traffic</h2>
            </div>
            <span className={styles.pill}>All packets</span>
          </div>
          {packets.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📡</span>
              <span>Listening for network activity…</span>
            </div>
          ) : (
            <div className={styles.activityList} ref={activityListRef}>
              {[...packets].reverse().map((packet, index) => (
                <article
                  key={`${packet.timestamp}-${index}`}
                  className={`${styles.packetRow} ${index === packets.length - 1 ? styles.packetRowNew : ''}`}
                >
                  <div className={styles.packetRowHeader}>
                    <div className={styles.packetIdentity}>
                      <span className={styles.packetName}>{packet.procName || 'Unknown app'}</span>
                      <span className={styles.packetMeta}>PID {packet.pid ?? 'N/A'}</span>
                    </div>
                    <span className={styles.timestamp}>
                      {new Date(packet.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className={styles.packetRoute}>
                    <span className={styles.routeEndpoint}>
                      {getSourceIP(packet)}:{getSourcePort(packet)}
                    </span>
                    <span className={styles.routeDivider} aria-hidden>
                      →
                    </span>
                    <span className={styles.routeEndpoint}>
                      {getDestIP(packet)}:{getDestPort(packet)}
                    </span>
                  </div>
                  <div className={styles.packetChips}>
                    <span className={styles.protocolChip}>{packet.protocol || 'Unknown'}</span>
                    <span className={styles.sizeChip}>{formatBytes(packet.size)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.appsCard}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Application insights</h2>
              <p className={styles.cardSubtitle}>Most active processes</p>
            </div>
            <span className={`${styles.pill} ${styles.appsPill}`}>
              {summary.uniqueApps.toLocaleString()} active
            </span>
          </div>
          {topApps.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>💤</span>
              <span>No application traffic detected yet.</span>
            </div>
          ) : (
            <div className={styles.appsList}>
              {topApps.map((app, index) => (
                <article key={`${app.name}-${app.pid ?? 'N/A'}-${index}`} className={styles.appRow}>
                  <div className={styles.appIdentity}>
                    <span className={styles.appRank}>{index + 1}</span>
                    <div>
                      <span className={styles.appName}>{app.name}</span>
                      <span className={styles.appMeta}>PID {app.pid ?? 'N/A'}</span>
                    </div>
                  </div>
                  <div className={styles.appMetrics}>
                    <div>
                      <span className={styles.appMetricValue}>
                        {app.packetCount.toLocaleString()}
                      </span>
                      <span className={styles.appMetricCaption}>packets</span>
                    </div>
                    <div>
                      <span className={styles.appMetricValue}>{formatBytes(app.totalBytes)}</span>
                      <span className={styles.appMetricCaption}>data</span>
                    </div>
                    <div>
                      <span className={styles.appMetricValue}>{formatTimeAgo(app.lastSeen)}</span>
                      <span className={styles.appMetricCaption}>last seen</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className={styles.footer}>
        <Versions />
      </footer>
    </div>
  )
}

export default App
