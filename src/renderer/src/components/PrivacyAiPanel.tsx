import type React from 'react'
import { type CSSProperties, useEffect, useState } from 'react'

type SnapshotApp = { name?: string; totalBytes?: number }

type PrivacySnapshot = {
  topApps?: SnapshotApp[]
  // allow additional properties without enforcing a strict shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

type SnapshotBuilder = () => PrivacySnapshot

export default function PrivacyAiPanel({
  snapshotBuilder
}: {
  snapshotBuilder: SnapshotBuilder
}): React.JSX.Element {
  // state for loading and AI text
  const [loading, setLoading] = useState(false)
  const [displayedResult, setDisplayedResult] = useState<string>('')
  const [isThinking, setIsThinking] = useState(false)

  const [aiDots, setAiDots] = useState(0)

  type RiskLevel = 'low' | 'medium' | 'high' | null
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(null)

  const [typedSummary, setTypedSummary] = useState('')
  const [typedRisk, setTypedRisk] = useState('')
  const [typedActions, setTypedActions] = useState('')

  type SimpleApp = { name: string; totalBytes: number }

  const [topApps, setTopApps] = useState<SimpleApp[]>([])
  const [selectedAppIndex, setSelectedAppIndex] = useState<number | null>(null)

  async function handleAnalyze(appIndexOverride?: number | null): Promise<void> {
    try {
      setLoading(true)
      setDisplayedResult('')
      setIsThinking(true)
      setRiskLevel(null)

      const baseSnapshot = (snapshotBuilder?.() ?? {}) as PrivacySnapshot
      const maybeTop = baseSnapshot.topApps

      if (Array.isArray(maybeTop) && maybeTop.length > 0) {
        const simplified = maybeTop.slice(0, 5).map((app: SnapshotApp) => ({
          name: app.name ?? 'Unknown',
          totalBytes: typeof app.totalBytes === 'number' ? app.totalBytes : 0
        }))
        setTopApps(simplified)
      }

      const effectiveIndex =
        typeof appIndexOverride === 'number' ? appIndexOverride : selectedAppIndex

      let snapshotToSend = baseSnapshot

      if (
        Array.isArray(maybeTop) &&
        typeof effectiveIndex === 'number' &&
        maybeTop[effectiveIndex]
      ) {
        const focus = maybeTop[effectiveIndex]
        snapshotToSend = {
          ...baseSnapshot,
          focusAppName: focus.name ?? 'Unknown',
          focusAppBytes: typeof focus.totalBytes === 'number' ? focus.totalBytes : undefined
        }
      }

      type PrivacyApi = {
        getPrivacySummary: (snapshot: unknown) => Promise<string>
      }

      const api = (window as unknown as { api?: PrivacyApi }).api

      const text = api ? await api.getPrivacySummary(snapshotToSend) : ''

      const finalText = typeof text === 'string' ? text : 'Unable to process summary.'

      let detectedRisk: RiskLevel = null
      const riskMatch = finalText.match(/Overall risk:\s*([A-Za-z]+)/i)
      if (riskMatch && riskMatch[1]) {
        const word = riskMatch[1].toLowerCase()
        if (word.startsWith('low')) detectedRisk = 'low'
        else if (word.startsWith('med')) detectedRisk = 'medium'
        else if (word.startsWith('high')) detectedRisk = 'high'
      }
      setRiskLevel(detectedRisk)
      setDisplayedResult(finalText)
      setIsThinking(false)
    } catch (e) {
      console.error('AI panel error:', e)
      const fallback = 'AI analysis failed.'
      setDisplayedResult(fallback)
      setRiskLevel(null)
      setIsThinking(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loading) {
      setAiDots(0)
      return
    }

    const id = window.setInterval(() => {
      setAiDots((prev) => (prev + 1) % 4)
    }, 350)

    return () => {
      window.clearInterval(id)
    }
  }, [loading])

  useEffect(() => {
    // Auto-run an analysis of the overall session when the panel first mounts.
    // This ensures that when AI mode is enabled, the user immediately sees a summary
    // without having to click "Current session" manually.
    void handleAnalyze(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getRiskChipStyles(level: RiskLevel): CSSProperties {
    const base = {
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: '10px',
      fontWeight: 500 as const,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
    if (level === 'low') {
      return {
        ...base,
        background: 'rgba(22,163,74,0.08)',
        color: '#16a34a',
        border: '1px solid rgba(22,163,74,0.35)'
      }
    }
    if (level === 'medium') {
      return {
        ...base,
        background: 'rgba(234,179,8,0.08)',
        color: '#eab308',
        border: '1px solid rgba(234,179,8,0.35)'
      }
    }
    if (level === 'high') {
      return {
        ...base,
        background: 'rgba(220,38,38,0.08)',
        color: '#f97373',
        border: '1px solid rgba(220,38,38,0.35)'
      }
    }
    return base
  }

  function extractSegment(full: string, label: string): string {
    const match = full.match(new RegExp(`${label}:\\s*([^]+?)(?=\\n[A-Za-z ]+:|$)`, 'i'))
    return match?.[1]?.trim() ?? ''
  }

  // Smooth staged typing: Summary -> Overall risk -> Recommended actions
  useEffect(() => {
    if (!displayedResult) {
      setTypedSummary('')
      setTypedRisk('')
      setTypedActions('')
      return
    }

    const summary = extractSegment(displayedResult, 'Summary')
    const risk = extractSegment(displayedResult, 'Overall risk')
    const actions = extractSegment(displayedResult, 'Recommended actions')

    let cancelled = false
    const speed = 15

    const run = async (): Promise<void> => {
      const typeSegment = async (text: string, setter: (value: string) => void): Promise<void> => {
        setter('')
        for (let i = 1; i <= text.length; i++) {
          if (cancelled) return
          setter(text.slice(0, i))
          await new Promise((resolve) => setTimeout(resolve, speed))
        }
      }

      await typeSegment(summary, setTypedSummary)
      await typeSegment(risk, setTypedRisk)
      await typeSegment(actions, setTypedActions)
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [displayedResult])

  return (
    <div
      style={{
        padding: '10px 12px',
        fontSize: '12px',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderRadius: 8,
        border: '1px solid #1f2937',
        background: 'rgba(15,23,42,0.85)'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div
          style={{
            fontSize: '11px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: '#9ca3af'
          }}
        >
          <span>Privacy </span>
          <span>{`AI${loading ? '.'.repeat(aiDots) : ''}`}</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        />
      </div>

      {topApps.length > 0 && (
        <div
          style={{
            marginTop: 6,
            marginBottom: 4,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6
          }}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedAppIndex(null)
              handleAnalyze(null)
            }}
            style={{
              padding: '3px 8px',
              borderRadius: 999,
              border: selectedAppIndex === null ? '1px solid #4b5563' : '1px solid #374151',
              background: selectedAppIndex === null ? 'rgba(31,41,55,0.9)' : 'rgba(17,24,39,0.8)',
              color: '#e5e7eb',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            Current session
          </button>

          {topApps.map((app, index) => (
            <button
              key={app.name + index}
              type="button"
              onClick={() => {
                setSelectedAppIndex(index)
                handleAnalyze(index)
              }}
              style={{
                padding: '3px 8px',
                borderRadius: 999,
                border: selectedAppIndex === index ? '1px solid #4f46e5' : '1px solid #374151',
                background:
                  selectedAppIndex === index ? 'rgba(37,99,235,0.25)' : 'rgba(17,24,39,0.8)',
                color: '#e5e7eb',
                fontSize: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                maxWidth: 180,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              <span>{app.name || 'Unknown app'}</span>
              <span
                style={{
                  opacity: 0.7
                }}
              >
                · {app.totalBytes.toLocaleString()} B
              </span>
            </button>
          ))}
        </div>
      )}

      {topApps.length > 0 && (
        <div
          style={{
            marginTop: -2,
            marginBottom: 4,
            fontSize: '10px',
            color: '#9ca3af'
          }}
        >
          {selectedAppIndex === null || !topApps[selectedAppIndex] ? (
            <span>Privacy AI will analyze the overall session.</span>
          ) : (
            <span>
              Privacy AI will analyze{' '}
              <strong>{topApps[selectedAppIndex].name || 'Unknown app'}</strong>
              {typeof topApps[selectedAppIndex].totalBytes === 'number' && (
                <span> ({topApps[selectedAppIndex].totalBytes.toLocaleString()} B)</span>
              )}{' '}
              in detail.
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {!displayedResult && (
        <div
          style={{
            marginTop: 2,
            padding: '6px 0',
            fontSize: '11px',
            lineHeight: 1.4,
            color: '#9ca3af',
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          <div>
            <span
              style={{
                fontWeight: 600,
                color: '#e5e7eb'
              }}
            >
              Summary:{' '}
            </span>
            <span>{isThinking ? 'Preparing summary…' : 'No summary yet.'}</span>
          </div>
          <div>
            <span
              style={{
                fontWeight: 600,
                color: '#e5e7eb'
              }}
            >
              Overall risk:{' '}
            </span>
            <span>{isThinking ? 'Evaluating risk…' : 'Not evaluated yet.'}</span>
          </div>
          <div>
            <span
              style={{
                fontWeight: 600,
                color: '#e5e7eb'
              }}
            >
              Recommended actions:{' '}
            </span>
            <span>{isThinking ? 'Analysing actions…' : 'No actions yet.'}</span>
          </div>
        </div>
      )}

      {displayedResult && (
        <div
          style={{
            marginTop: 2,
            padding: '8px 9px',
            borderRadius: 6,
            background: '#020617',
            border: '1px solid #1f2937',
            maxHeight: 180,
            overflowY: 'auto'
          }}
        >
          {riskLevel && (
            <div style={{ marginBottom: 6 }}>
              <span style={getRiskChipStyles(riskLevel)}>
                Overall risk: {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
              </span>
            </div>
          )}

          {/* Staged typing for Summary, Overall risk, Recommended actions */}
          {typedSummary && (
            <div
              style={{
                marginBottom: 4,
                fontSize: '11px',
                lineHeight: 1.4
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: '#e5e7eb'
                }}
              >
                Summary:{' '}
              </span>
              <span>{typedSummary}</span>
            </div>
          )}

          {typedRisk && (
            <div
              style={{
                marginBottom: 4,
                fontSize: '11px',
                lineHeight: 1.4
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: '#e5e7eb'
                }}
              >
                Overall risk:{' '}
              </span>
              <span>{typedRisk}</span>
            </div>
          )}

          {/* Recommended actions, suppressed if boilerplate */}
          {(() => {
            if (!typedActions) return null
            const lower = typedActions.toLowerCase()
            if (
              lower.includes('no specific actions suggested') ||
              lower.includes('no specific actions') ||
              lower.includes('no action required') ||
              lower.includes('no actions required')
            ) {
              return null
            }
            return (
              <div
                style={{
                  marginBottom: 4,
                  fontSize: '11px',
                  lineHeight: 1.4
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    color: '#e5e7eb'
                  }}
                >
                  Recommended actions:{' '}
                </span>
                <span>{typedActions}</span>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
