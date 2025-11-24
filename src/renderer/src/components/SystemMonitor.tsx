import { useEffect, useState, useMemo } from 'react'
import styles from '../App.module.css'

interface TCCEvent {
  id: string
  timestamp: Date
  app: string
  appName: string
  bundleId: string
  path: string
  service: string
  allowed: boolean
  authValue: number
  authReason: string
  pid: number
  userId: number
  eventType: 'request' | 'usage'
  sessionStart?: Date
  sessionEnd?: Date
  duration?: number
}

const serviceIcons: Record<string, string> = {
  Camera: '📷',
  Microphone: '🎤',
  ScreenCapture: '🖥️',
  Accessibility: '♿',
  Location: '📍',
  Contacts: '👥',
  Calendar: '📅',
  Reminders: '✅',
  Photos: '🖼️',
  MediaLibrary: '🎵',
  FileProviderDomain: '📁',
  ListenEvent: '🔊',
  ScreenshotMonitoring: '📸'
}

export function SystemMonitor(): React.JSX.Element {
  const [events, setEvents] = useState<TCCEvent[]>([])
  const [activeSessions, setActiveSessions] = useState<TCCEvent[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  // const [isSupported, setIsSupported] = useState(true)

  // Separate permission requests from active usage for display
  const permissionRequests = useMemo(
    () => events.filter((e) => e.eventType === 'request'),
    [events]
  )

  useEffect(() => {
    // Check platform support on mount
    // const checkSupport = async (): Promise<void> => {
    //   const supported = await window.systemAPI.isSupported()
    //   setIsSupported(supported)
    // }
    // void checkSupport()

    // Listen for new events
    window.systemAPI.onEvent((event: TCCEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, 100)) // Keep last 100
    })

    // Listen for session updates
    window.systemAPI.onSessionUpdate((event: TCCEvent) => {
      if (event.sessionEnd) {
        // Session ended - remove from active, add to history
        setActiveSessions((prev) => prev.filter((s) => s.id !== event.id))
        setEvents((prev) => {
          const updated = prev.map((e) => (e.id === event.id ? event : e))
          return updated.some((e) => e.id === event.id) ? updated : [event, ...updated]
        })
      } else {
        // Session started or updated
        setActiveSessions((prev) => {
          const exists = prev.find((s) => s.id === event.id)
          if (exists) {
            return prev.map((s) => (s.id === event.id ? event : s))
          }
          return [event, ...prev]
        })
      }
    })

    return () => {
      window.systemAPI.removeAllListeners()
    }
  }, [])

  const handleStart = async (): Promise<void> => {
    await window.systemAPI.start()
    setIsMonitoring(true)
    // Load existing active sessions
    const sessions = await window.systemAPI.getActiveSessions()
    setActiveSessions(sessions)
  }

  const handleStop = async (): Promise<void> => {
    await window.systemAPI.stop()
    setIsMonitoring(false)
  }

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A'
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <div className={styles.shell}>
      <div className={styles.mainArea}>
        <header className={styles.mainHeader}>
          <div>
            <h1 className={styles.pageTitle}>System Monitor</h1>
            <p className={styles.pageSubtitle}>Monitor OS permission requests and resource usage</p>
            <p
              className={styles.pageSubtitle}
              style={{
                marginTop: '0.5rem',
                fontSize: '0.85em',
                opacity: 0.8,
                maxWidth: '600px'
              }}
            >
              <strong>💡 Tip:</strong> <em>Permission requests</em> (🔔) occur when apps ask for
              access. <em>Active usage</em> (⚡) indicates apps are currently using that resource
              (e.g., camera recording, microphone listening).
            </p>
          </div>
          <button
            onClick={isMonitoring ? handleStop : handleStart}
            className={`${styles.captureButton} ${
              isMonitoring ? styles.captureButtonActive : styles.captureButtonIdle
            }`}
          >
            {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
        </header>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Permission Requests</span>
            <span className={styles.summaryValue}>
              {permissionRequests.length.toLocaleString()}
            </span>
            <span className={styles.summaryMeta}>Apps asking for access</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Active Usage</span>
            <span className={styles.summaryValue}>{activeSessions.length.toLocaleString()}</span>
            <span className={styles.summaryMeta}>Currently using resources</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Total Events</span>
            <span className={styles.summaryValue}>{events.length.toLocaleString()}</span>
            <span className={styles.summaryMeta}>All privacy events detected</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Monitoring Status</span>
            <span className={styles.summaryValue}>{isMonitoring ? '🟢 Active' : '🔴 Stopped'}</span>
            <span className={styles.summaryMeta}>
              {isMonitoring ? 'Capturing events' : 'Not monitoring'}
            </span>
          </article>
        </section>

        {activeSessions.length > 0 && (
          <div className={styles.contentGrid}>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>🔴 Active Privacy Sessions</h2>
                  <p className={styles.panelSubtitle}>Applications currently accessing resources</p>
                </div>
                <span className={styles.panelBadge}>
                  {activeSessions.length.toLocaleString()} active
                </span>
              </header>
              <div className={styles.packetList}>
                {activeSessions.map((session) => (
                  <article
                    key={session.id}
                    className={`${styles.packetRow} ${styles.packetRowNew}`}
                  >
                    <div className={styles.packetHeader}>
                      <div className={styles.packetIdentity}>
                        <span className={styles.packetName} style={{ fontSize: '1.2em' }}>
                          {serviceIcons[session.service] || '🔒'} {session.appName}
                        </span>
                        <span className={styles.packetMeta}>
                          {session.service} • {session.bundleId}
                        </span>
                      </div>
                      <span className={styles.packetTimestamp}>
                        Active: {formatDuration(session.duration)}
                      </span>
                    </div>
                    <div className={styles.packetChips}>
                      <span className={`${styles.chip} ${styles.chipProtocol}`}>
                        PID: {session.pid}
                      </span>
                      <span className={`${styles.chip} ${styles.chipInterface}`}>
                        {session.authReason}
                      </span>
                      <span className={`${styles.chip} ${styles.chipSize}`}>
                        {session.allowed ? '✅ Allowed' : '❌ Denied'}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        <div className={styles.contentGrid}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Event History</h2>
                <p className={styles.panelSubtitle}>Recent privacy permission requests</p>
              </div>
              <span className={styles.panelBadge}>{events.length.toLocaleString()} events</span>
            </header>
            {events.length === 0 ? (
              <div className={styles.panelEmpty}>
                <span className={styles.emptyGlyph}>🔒</span>
                <span>
                  {isMonitoring
                    ? 'Listening for system permission events...'
                    : 'Start monitoring to see system permission events'}
                </span>
              </div>
            ) : (
              <div className={styles.packetList}>
                {events.map((event) => (
                  <article
                    key={event.id}
                    className={`${styles.packetRow} ${!event.allowed ? styles.packetRowNew : ''}`}
                  >
                    <div className={styles.packetHeader}>
                      <div className={styles.packetIdentity}>
                        <span className={styles.packetName}>
                          {serviceIcons[event.service] || '🔒'} {event.appName}
                        </span>
                        <span className={styles.packetMeta}>
                          {event.service} • {event.bundleId}
                        </span>
                        {event.sessionEnd && (
                          <span className={styles.packetMeta}>
                            Duration: {formatDuration(event.duration)}
                          </span>
                        )}
                      </div>
                      <span className={styles.packetTimestamp}>
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className={styles.packetRoute}>
                      <span className={styles.routeEndpoint}>{event.path || 'No path'}</span>
                    </div>
                    <div className={styles.packetChips}>
                      <span className={`${styles.chip} ${styles.chipProtocol}`}>
                        PID: {event.pid}
                      </span>
                      <span
                        className={`${styles.chip} ${styles.chipInterface}`}
                        title={
                          event.eventType === 'request'
                            ? 'Permission request - app is asking for access'
                            : 'Active usage - app is currently using this resource'
                        }
                      >
                        {event.eventType === 'request' ? '🔔 Request' : '⚡ Active'}
                      </span>
                      <span className={`${styles.chip} ${styles.chipInterface}`}>
                        {event.authReason}
                      </span>
                      <span
                        className={`${styles.chip} ${
                          event.allowed ? styles.chipSize : styles.chipProtocol
                        }`}
                      >
                        {event.allowed ? '✅ Allowed' : '❌ Denied'}
                      </span>
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
