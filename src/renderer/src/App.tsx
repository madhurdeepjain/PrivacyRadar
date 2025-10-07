import { useState, useEffect, useMemo, useRef } from 'react'
import Versions from './components/Versions'
import logo from '../../../resources/icon.png'
import styles from './App.module.css'

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
  const activityListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleNetworkData = (data: PacketData): void => {
      setPacketCount((prev) => prev + 1)
      setPackets((prev) => [data, ...prev].slice(0, 500)) // Keep last 500 packets
    }

    window.api.onNetworkData(handleNetworkData)
    return () => {
      window.api.removeNetworkDataListener()
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
    const appMap = new Map<string, AppStats>()

    packets.forEach((packet) => {
      const appName = packet.procName || 'UNKNOWN'
      const key = `${appName}-${packet.pid ?? 'N/A'}`

      if (appMap.has(key)) {
        const existing = appMap.get(key)!
        existing.packetCount++
        existing.totalBytes += packet.size
        existing.lastSeen = Math.max(existing.lastSeen, packet.timestamp)
      } else {
        appMap.set(key, {
          name: appName,
          pid: packet.pid,
          packetCount: 1,
          totalBytes: packet.size,
          lastSeen: packet.timestamp
        })
      }
    })

    return Array.from(appMap.values()).sort((a, b) => b.packetCount - a.packetCount)
  }, [packets])

  const summary = useMemo(() => {
    if (packets.length === 0) {
      return {
        totalBytes: 0,
        uniqueApps: 0,
        bytesPerSecond: 0,
        lastPacketTimestamp: undefined as number | undefined
      }
    }

    const totalBytes = packets.reduce((acc, packet) => acc + packet.size, 0)
    const uniqueApps = new Set<string>()
    const now = Date.now()
    let recentBytes = 0
    let oldestRecentTimestamp = Number.POSITIVE_INFINITY

    packets.forEach((packet) => {
      uniqueApps.add(`${packet.procName || 'UNKNOWN'}-${packet.pid ?? 'N/A'}`)

      if (now - packet.timestamp <= 30_000) {
        recentBytes += packet.size
        oldestRecentTimestamp = Math.min(oldestRecentTimestamp, packet.timestamp)
      }
    })

    const windowSeconds = Math.max(
      1,
      (now - (oldestRecentTimestamp === Number.POSITIVE_INFINITY ? now : oldestRecentTimestamp)) /
        1000
    )
    const bytesPerSecond = recentBytes / windowSeconds

    return {
      totalBytes,
      uniqueApps: uniqueApps.size,
      bytesPerSecond: Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0,
      lastPacketTimestamp: packets[0]?.timestamp
    }
  }, [packets])

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
        <div className={styles.liveBadge}>
          <span className={styles.liveDot} aria-hidden />
          {packets.length > 0 ? 'Streaming now' : 'Waiting for packets'}
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
          <span className={styles.metricHint}>Across the latest 500 packets</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Throughput (30s avg)</span>
          <span className={styles.metricValue}>{formatRate(summary.bytesPerSecond)}</span>
          <span className={styles.metricHint}>Recent transfer rate</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Data observed</span>
          <span className={styles.metricValue}>{formatBytes(summary.totalBytes)}</span>
          <span className={styles.metricHint}>From the last 500 packets</span>
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
