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
  interfaceName?: string
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
  const [selectedInterfaces, setSelectedInterfaces] = useState<string[]>([])
  const [isSwitchingInterface, setIsSwitchingInterface] = useState(false)
  const [interfaceError, setInterfaceError] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const activityListRef = useRef<HTMLDivElement>(null)

  const getInterfaceCategory = (iface: InterfaceOption): string => {
    const name = iface.name.toLowerCase()
    const description = (iface.description || '').toLowerCase()
    const friendly = (iface.friendlyName || '').toLowerCase()

    if (
      name.startsWith('lo') ||
      description.includes('loopback') ||
      friendly.includes('loopback')
    ) {
      return 'Loopback'
    }

    if (
      description.includes('wi-fi') ||
      description.includes('wifi') ||
      description.includes('wireless') ||
      friendly.includes('wi-fi') ||
      friendly.includes('wifi') ||
      friendly.includes('wireless')
    ) {
      return 'Wi-Fi & Wireless'
    }

    if (
      name.startsWith('en') ||
      description.includes('ethernet') ||
      description.includes('lan') ||
      friendly.includes('ethernet') ||
      friendly.includes('lan')
    ) {
      return 'Ethernet & Wired'
    }

    if (
      description.includes('virtual') ||
      description.includes('vmware') ||
      description.includes('hyper-v') ||
      description.includes('vpn') ||
      description.includes('tunnel') ||
      description.includes('pseudo') ||
      friendly.includes('virtual') ||
      friendly.includes('vpn') ||
      friendly.includes('tunnel')
    ) {
      return 'Virtual & Tunnels'
    }

    return 'Other'
  }

  const groupedInterfaces = useMemo(() => {
    const groups: Record<string, InterfaceOption[]> = {}
    interfaces.forEach((iface) => {
      const category = getInterfaceCategory(iface)
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(iface)
    })
    return groups
  }, [interfaces])

  const orderedInterfaceGroups = useMemo(() => {
    const priority = [
      'Wi-Fi & Wireless',
      'Ethernet & Wired',
      'Loopback',
      'Virtual & Tunnels',
      'Other'
    ]
    const entries: Array<[string, InterfaceOption[]]> = []

    priority.forEach((category) => {
      const list = groupedInterfaces[category]
      if (list && list.length > 0) {
        entries.push([category, list])
      }
    })

    Object.entries(groupedInterfaces).forEach(([category, list]) => {
      if (priority.includes(category)) {
        return
      }
      entries.push([category, list])
    })

    return entries
  }, [groupedInterfaces])

  const interfaceCategoryMap = useMemo(() => {
    const map: Record<string, { category: string; label: string }> = {}
    interfaces.forEach((iface) => {
      map[iface.name] = {
        category: getInterfaceCategory(iface),
        label: iface.friendlyName || iface.description || iface.name
      }
    })
    return map
  }, [interfaces])

  const selectionSummary = useMemo(() => {
    if (interfaces.length === 0) {
      return 'No interfaces detected'
    }

    if (selectedInterfaces.length === interfaces.length) {
      return 'All interfaces selected'
    }

    if (selectedInterfaces.length === 1) {
      const match = interfaces.find((iface) => iface.name === selectedInterfaces[0])
      if (match) {
        const label = match.friendlyName || match.description || match.name
        return `Selected ${label}`
      }
      return '1 interface selected'
    }

    return `${selectedInterfaces.length} interfaces selected`
  }, [interfaces, selectedInterfaces])

  const applyInterfaceSelection = (selection: InterfaceSelectionResult): void => {
    setInterfaces(selection.interfaces)

    const nextSelection =
      selection.selectedInterfaceNames.length > 0
        ? selection.selectedInterfaceNames
        : selection.interfaces.map((iface) => iface.name)

    setSelectedInterfaces(nextSelection)
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
    const handleNetworkData = (data: PacketData): void => {
      setPacketCount((prev) => prev + 1)
      setPackets((prev) => [data, ...prev].slice(0, 500)) // Keep last 500 packets
      setTotalBytes((prev) => prev + data.size)
      setLastPacketTimestamp(data.timestamp)
      setAppStatsMap((prev) => {
        const appName = data.procName || 'UNKNOWN'
        const key = `${appName}-${data.pid ?? 'N/A'}`
        const next = { ...prev }

        if (next[key]) {
          const existing = next[key]
          next[key] = {
            ...existing,
            packetCount: existing.packetCount + 1,
            totalBytes: existing.totalBytes + data.size,
            lastSeen: Math.max(existing.lastSeen, data.timestamp)
          }
        } else {
          next[key] = {
            name: appName,
            pid: data.pid,
            packetCount: 1,
            totalBytes: data.size,
            lastSeen: data.timestamp
          }
        }

        return next
      })

      const samples = throughputSamplesRef.current
      const windowStart = data.timestamp - 30_000
      samples.push({ timestamp: data.timestamp, size: data.size })
      while (samples.length > 0 && samples[0].timestamp < windowStart) {
        samples.shift()
      }

      if (samples.length === 0) {
        setBytesPerSecond(0)
      } else {
        const recentBytes = samples.reduce((acc, sample) => acc + sample.size, 0)
        const spanSeconds = Math.max(1, (data.timestamp - samples[0].timestamp) / 1000)
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

  const submitInterfaceSelection = async (nextInterfaces: string[]): Promise<void> => {
    const previousSelection = selectedInterfaces
    setIsSwitchingInterface(true)
    setInterfaceError(null)
    setCaptureError(null)

    try {
      const selection = await window.api.selectNetworkInterface(nextInterfaces)
      applyInterfaceSelection(selection)
    } catch (error) {
      console.error('Failed to update network interface selection', error)
      setInterfaceError('Unable to update interface selection')
      setSelectedInterfaces(previousSelection)
    } finally {
      setIsSwitchingInterface(false)
    }
  }

  const handleInterfaceToggle = async (interfaceName: string, checked: boolean): Promise<void> => {
    const nextSelection = checked
      ? Array.from(new Set([...selectedInterfaces, interfaceName]))
      : selectedInterfaces.filter((name) => name !== interfaceName)

    if (nextSelection.length === 0) {
      setInterfaceError('Select at least one interface')
      return
    }

    setSelectedInterfaces(nextSelection)
    await submitInterfaceSelection(nextSelection)
  }

  const handleSelectAll = async (): Promise<void> => {
    if (interfaces.length === 0) return
    const allNames = interfaces.map((iface) => iface.name)
    setSelectedInterfaces(allNames)
    await submitInterfaceSelection(allNames)
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

  const getPacketInterfaceCategory = (packet: PacketData): string => {
    if (!packet.interfaceName) {
      return 'Unknown interface'
    }

    return interfaceCategoryMap[packet.interfaceName]?.category ?? 'Other interface'
  }

  const getPacketInterfaceLabel = (packet: PacketData): string => {
    if (!packet.interfaceName) {
      return 'Interface not reported'
    }

    return interfaceCategoryMap[packet.interfaceName]?.label ?? packet.interfaceName
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.navRail}>
        <div className={styles.brandBlock}>
          <img alt="PrivacyRadar" className={styles.brandMark} src={logo} />
          <div className={styles.brandCopy}>
            <span className={styles.brandName}>PrivacyRadar</span>
            <span className={styles.brandTagline}>Live network awareness</span>
          </div>
        </div>

        <div className={styles.captureBlock}>
          <button
            type="button"
            className={`${styles.captureButton} ${
              isCapturing ? styles.captureButtonActive : styles.captureButtonIdle
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
          <span className={styles.captureState}>
            {isUpdatingCapture
              ? isCapturing
                ? 'Pausing capture'
                : 'Starting capture'
              : isCapturing
                ? 'Capturing live traffic'
                : 'Capture paused'}
          </span>
          {captureError && <span className={styles.errorText}>{captureError}</span>}
        </div>

        <div className={styles.interfaceSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionLabel} id="interface-select">
                Interfaces
              </span>
              <span className={styles.sectionSummary}>{selectionSummary}</span>
            </div>
          </div>
          {interfaces.length === 0 ? (
            <div className={styles.interfaceEmpty}>No interfaces detected</div>
          ) : (
            <>
              {isSwitchingInterface && (
                <span className={styles.sectionNote}>Updating selection...</span>
              )}
              {interfaceError && <span className={styles.errorText}>{interfaceError}</span>}
              <div className={styles.interfaceList} role="group" aria-labelledby="interface-select">
                {orderedInterfaceGroups.map(([category, items]) => {
                  const selectedCount = items.filter((iface) =>
                    selectedInterfaces.includes(iface.name)
                  ).length

                  return (
                    <div key={category} className={styles.interfaceGroup}>
                      <div className={styles.interfaceGroupHeader}>
                        <span>{category}</span>
                        <span>
                          {selectedCount}/{items.length}
                        </span>
                      </div>
                      <ul className={styles.interfaceGroupList}>
                        {items.map((iface) => {
                          const checked = selectedInterfaces.includes(iface.name)
                          return (
                            <li key={iface.name} className={styles.interfaceGroupItem}>
                              <label className={styles.interfaceCheckboxLabel}>
                                <input
                                  type="checkbox"
                                  className={styles.interfaceCheckbox}
                                  checked={checked}
                                  disabled={isSwitchingInterface || isUpdatingCapture}
                                  onChange={async (event) => {
                                    await handleInterfaceToggle(iface.name, event.target.checked)
                                  }}
                                />
                                <span>{renderInterfaceOptionLabel(iface)}</span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleSelectAll}
                disabled={
                  isSwitchingInterface ||
                  isUpdatingCapture ||
                  selectedInterfaces.length === interfaces.length
                }
              >
                Select all
              </button>
            </>
          )}
        </div>

        <div className={styles.railSpacer} />

        <div className={styles.railFooter}>
          <Versions />
        </div>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.mainHeader}>
          <div>
            <h1 className={styles.pageTitle}>Network operations</h1>
            <p className={styles.pageSubtitle}>Monitor live packet flow and application activity</p>
          </div>
          <div className={`${styles.liveBadge} ${!isCapturing ? styles.liveBadgeMuted : ''}`}>
            <span
              className={`${styles.liveDot} ${!isCapturing ? styles.liveDotMuted : ''}`}
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

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Packets captured</span>
            <span className={styles.summaryValue}>{packetCount.toLocaleString()}</span>
            <span className={styles.summaryMeta}>
              Last update {formatTimeAgo(summary.lastPacketTimestamp)}
            </span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Active applications</span>
            <span className={styles.summaryValue}>{summary.uniqueApps.toLocaleString()}</span>
            <span className={styles.summaryMeta}>Since session start</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Throughput (30s)</span>
            <span className={styles.summaryValue}>{formatRate(summary.bytesPerSecond)}</span>
            <span className={styles.summaryMeta}>Rolling average</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Data observed</span>
            <span className={styles.summaryValue}>{formatBytes(summary.totalBytes)}</span>
            <span className={styles.summaryMeta}>Across selected interfaces</span>
          </article>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Live traffic</h2>
                <p className={styles.panelSubtitle}>Newest activity appears at the bottom</p>
              </div>
              <span className={styles.panelBadge}>{packets.length.toLocaleString()} packets</span>
            </header>
            {packets.length === 0 ? (
              <div className={styles.panelEmpty}>
                <span className={styles.emptyGlyph}>📡</span>
                <span>Listening for network activity...</span>
              </div>
            ) : (
              <div className={styles.packetList} ref={activityListRef}>
                {[...packets].reverse().map((packet, index) => (
                  <article
                    key={`${packet.timestamp}-${index}`}
                    className={`${styles.packetRow} ${index === packets.length - 1 ? styles.packetRowNew : ''}`}
                  >
                    <div className={styles.packetHeader}>
                      <div className={styles.packetIdentity}>
                        <span className={styles.packetName}>
                          {packet.procName || 'Unknown app'}
                        </span>
                        <span className={styles.packetMeta}>PID {packet.pid ?? 'N/A'}</span>
                      </div>
                      <span className={styles.packetTimestamp}>
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
                      <span className={`${styles.chip} ${styles.chipProtocol}`}>
                        {packet.protocol || 'Unknown'}
                      </span>
                      <span
                        className={`${styles.chip} ${styles.chipInterface}`}
                        title={getPacketInterfaceLabel(packet)}
                      >
                        {getPacketInterfaceCategory(packet)}
                      </span>
                      <span className={`${styles.chip} ${styles.chipSize}`}>
                        {formatBytes(packet.size)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={`${styles.panel} ${styles.appsPanel}`}>
            <header className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Application insights</h2>
                <p className={styles.panelSubtitle}>Most active processes</p>
              </div>
              <span className={styles.panelBadge}>
                {summary.uniqueApps.toLocaleString()} active
              </span>
            </header>
            {topApps.length === 0 ? (
              <div className={styles.panelEmpty}>
                <span className={styles.emptyGlyph}>💤</span>
                <span>No application traffic detected yet.</span>
              </div>
            ) : (
              <div className={styles.appsList}>
                {topApps.map((app, index) => (
                  <article
                    key={`${app.name}-${app.pid ?? 'N/A'}-${index}`}
                    className={styles.appRow}
                  >
                    <div className={styles.appHeader}>
                      <span className={styles.appRank}>{index + 1}</span>
                      <div className={styles.appIdentityBlock}>
                        <span className={styles.appName}>{app.name}</span>
                        <span className={styles.appMeta}>PID {app.pid ?? 'N/A'}</span>
                      </div>
                    </div>
                    <div className={styles.appMetrics}>
                      <div className={styles.metricItem}>
                        <span className={styles.metricValue}>
                          {app.packetCount.toLocaleString()}
                        </span>
                        <span className={styles.metricCaption}>packets</span>
                      </div>
                      <div className={styles.metricItem}>
                        <span className={styles.metricValue}>{formatBytes(app.totalBytes)}</span>
                        <span className={styles.metricCaption}>data</span>
                      </div>
                      <div className={styles.metricItem}>
                        <span className={styles.metricValue}>{formatTimeAgo(app.lastSeen)}</span>
                        <span className={styles.metricCaption}>last seen</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
