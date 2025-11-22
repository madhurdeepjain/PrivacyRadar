import React, { useMemo, useState } from 'react'

export type AiSummaryProps = {
  summary: {
    totalBytes: number
    uniqueApps: number
    bytesPerSecond: number
    lastPacketTimestamp?: number
  }
  topApps: {
    name: string
    pid?: number
    packetCount: number
    totalBytes: number
    lastSeen: number
  }[]
  isCapturing: boolean
}

type InsightState =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'ready'; text: string; generatedAt: number }
  | { kind: 'error'; message: string }

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatTimeAgo = (timestamp?: number): string => {
  if (!timestamp) return 'awaiting data'
  const diff = Date.now() - timestamp
  if (diff < 1_000) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1_000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  return new Date(timestamp).toLocaleTimeString()
}

export const AiInsightsPanel: React.FC<AiSummaryProps> = ({ summary, topApps, isCapturing }) => {
  const [state, setState] = useState<InsightState>({ kind: 'idle' })

  const hasTraffic = summary.totalBytes > 0 && summary.uniqueApps > 0

  const headline = useMemo(() => {
    if (!hasTraffic) {
      if (!isCapturing) {
        return 'Start a capture to let AI observe your traffic.'
      }
      return 'Waiting for the first packets of this session.'
    }

    return `Monitoring ${summary.uniqueApps} active application${
      summary.uniqueApps === 1 ? '' : 's'
    } across ${formatBytes(summary.totalBytes)} of traffic.`
  }, [hasTraffic, isCapturing, summary.totalBytes, summary.uniqueApps])

  const keySignals = useMemo(() => {
    if (!hasTraffic) return [] as string[]

    const signals: string[] = []

    if (summary.bytesPerSecond > 0) {
      signals.push(`Live throughput ~ ${formatBytes(summary.bytesPerSecond)}/s`)
    }

    if (topApps.length > 0) {
      const primary = topApps[0]
      signals.push(
        `${primary.name} is the most active app with ${formatBytes(primary.totalBytes)} observed`
      )
    }

    if (topApps.length > 1) {
      signals.push(`${topApps.length} apps have sent or received data this session`)
    }

    return signals
  }, [hasTraffic, summary.bytesPerSecond, topApps])

  const handleExplain = () => {
    if (!hasTraffic) {
      setState({
        kind: 'error',
        message:
          'There is not enough traffic yet to summarize. Start capture and use a few apps, then try again.'
      })
      return
    }

    setState({ kind: 'thinking' })

    // For now we generate a local, deterministic summary from the props.
    // This is a placeholder for the real LLM call that will be wired in later.
    window.setTimeout(() => {
      try {
        const lines: string[] = []

        lines.push(
          `Based on the current capture, there are ${summary.uniqueApps.toLocaleString()} active application${
            summary.uniqueApps === 1 ? '' : 's'
          } sending or receiving traffic. In total, we have observed ${formatBytes(
            summary.totalBytes
          )} of data so far.`
        )

        if (topApps.length > 0) {
          const primary = topApps[0]
          lines.push(
            `${primary.name} appears to be the busiest process right now, with ${formatBytes(
              primary.totalBytes
            )} across ${primary.packetCount.toLocaleString()} packet${
              primary.packetCount === 1 ? '' : 's'
            }.`
          )
        }

        if (topApps.length > 1) {
          const secondaryNames = topApps
            .slice(1, 3)
            .map((a) => a.name)
            .filter(Boolean)

          if (secondaryNames.length > 0) {
            lines.push(`Other notable apps in this session include ${secondaryNames.join(', ')}.`)
          }
        }

        if (summary.bytesPerSecond > 0) {
          lines.push(
            `Traffic is currently flowing at around ${formatBytes(
              summary.bytesPerSecond
            )} per second over the last 30 seconds.`
          )
        }

        lines.push(
          'This is a high-level behavioral summary only. In the next iteration, this assistant will correlate destinations, protocols, and host patterns to highlight potential privacy risks more explicitly.'
        )

        setState({ kind: 'ready', text: lines.join(' '), generatedAt: Date.now() })
      } catch (error: any) {
        console.error('Error generating local AI summary', error)
        setState({
          kind: 'error',
          message: 'Something went wrong while preparing this summary.'
        })
      }
    }, 450)
  }

  const renderBody = () => {
    if (state.kind === 'thinking') {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div
            style={{
              height: 12,
              borderRadius: 999,
              background:
                'linear-gradient(90deg, rgba(148,163,184,0.2), rgba(148,163,184,0.4), rgba(148,163,184,0.2))',
              backgroundSize: '200% 100%',
              animation: 'aiPulse 1.4s ease-in-out infinite'
            }}
          />
          <div
            style={{
              height: 10,
              width: '80%',
              borderRadius: 999,
              background: 'rgba(148,163,184,0.25)'
            }}
          />
          <p style={{ fontSize: 12, color: '#9ca3af' }}>
            Thinking about how these applications are behaving on the network…
          </p>
        </div>
      )
    }

    if (state.kind === 'ready') {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: '#e5e7eb'
            }}
          >
            {state.text}
          </p>
          <p style={{ fontSize: 11, color: '#6b7280' }}>
            Generated {formatTimeAgo(state.generatedAt)}
          </p>
        </div>
      )
    }

    if (state.kind === 'error') {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <p style={{ fontSize: 13, color: '#fecaca' }}>{state.message}</p>
          <p style={{ fontSize: 11, color: '#9ca3af' }}>
            If capture is running, generate some traffic (for example, open a few sites or apps) and
            try again.
          </p>
        </div>
      )
    }

    // idle
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}
      >
        <p style={{ fontSize: 13, color: '#e5e7eb' }}>{headline}</p>
        {!hasTraffic && (
          <p style={{ fontSize: 11, color: '#9ca3af' }}>
            Once traffic starts flowing, this assistant will summarize how your apps are using the
            network in plain language.
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        border: '1px solid rgba(148,163,184,0.35)',
        background:
          'radial-gradient(circle at 0% 0%, rgba(56,189,248,0.1), transparent 55%), radial-gradient(circle at 100% 100%, rgba(129,140,248,0.12), transparent 55%), rgba(15,23,42,0.9)',
        boxShadow: '0 18px 45px rgba(15,23,42,0.75)',
        maxHeight: '100%',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <span
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.12,
              color: '#9ca3af'
            }}
          >
            Privacy AI
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#e5e7eb'
            }}
          >
            Explain current session
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4
          }}
        >
          <span
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.7)',
              color: '#e5e7eb'
            }}
          >
            {isCapturing ? 'Observing live traffic' : 'Capture paused'}
          </span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>
            Last packet: {formatTimeAgo(summary.lastPacketTimestamp)}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: 10,
          borderRadius: 10,
          background: 'rgba(15,23,42,0.9)',
          border: '1px solid rgba(31,41,55,0.9)',
          maxHeight: 180,
          overflowY: 'auto'
        }}
      >
        {renderBody()}
      </div>

      {keySignals.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Key signals detected:</span>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6
            }}
          >
            {keySignals.map((signal) => (
              <span
                key={signal}
                style={{
                  fontSize: 11,
                  borderRadius: 999,
                  padding: '4px 8px',
                  border: '1px solid rgba(148,163,184,0.6)',
                  background: 'rgba(15,23,42,0.85)',
                  color: '#e5e7eb'
                }}
              >
                {signal}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginTop: 4
        }}
      >
        <button
          type="button"
          onClick={handleExplain}
          disabled={state.kind === 'thinking'}
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: 999,
            border: 'none',
            cursor: state.kind === 'thinking' ? 'default' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: '#020617',
            background:
              'linear-gradient(135deg, #22d3ee 0%, #6366f1 40%, #a855f7 80%, #f97316 100%)',
            boxShadow: '0 10px 30px rgba(15,23,42,0.85)',
            opacity: state.kind === 'thinking' ? 0.7 : 1
          }}
        >
          {state.kind === 'thinking' ? 'Analyzing…' : 'Explain current session'}
        </button>
        {state.kind === 'ready' && (
          <button
            type="button"
            onClick={() => setState({ kind: 'idle' })}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.7)',
              background: 'transparent',
              color: '#e5e7eb',
              fontSize: 11,
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

export default AiInsightsPanel
