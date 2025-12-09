import { useEffect, useState, useMemo } from 'react'
import { Shield, Activity, History, Play, Pause, Lock } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { StatCard } from './StatCard'

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
  ScreenshotMonitoring: '📸',
  Pasteboard: '📋',
  FullDiskAccess: '💽',
  Desktop: '🗂️',
  Documents: '📄',
  Downloads: '⬇️',
  Unknown: '🔒'
}

export function SystemMonitor(): React.JSX.Element {
  const [events, setEvents] = useState<TCCEvent[]>([])
  const [activeSessions, setActiveSessions] = useState<TCCEvent[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)

  const permissionRequests = useMemo(
    () => events.filter((e) => e.eventType === 'request'),
    [events]
  )

  useEffect(() => {
    window.systemAPI.onEvent((event: TCCEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, 100))
    })

    window.systemAPI.onSessionUpdate((event: TCCEvent) => {
      if (event.sessionEnd) {
        setActiveSessions((prev) => prev.filter((s) => s.id !== event.id))
        setEvents((prev) => {
          const updated = prev.map((e) => (e.id === event.id ? event : e))
          return updated.some((e) => e.id === event.id) ? updated : [event, ...updated]
        })
      } else {
        const NOTIFICATION_TITLE = (event.service || 'System Monitor') + ' Access Alert'
        const NOTIFICATION_BODY = event.appName + ' has ' + event.service + ' permission.'

        new Notification(NOTIFICATION_TITLE, { body: NOTIFICATION_BODY, icon: '../../resources/icon.ico'})
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
    <div className="flex flex-col h-full space-y-4 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Monitor</h1>
          <p className="text-muted-foreground">Track OS permission requests and resource usage</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={isMonitoring ? handleStop : handleStart}
            variant={isMonitoring ? 'destructive' : 'default'}
            className="w-32"
          >
            {isMonitoring ? (
              <>
                <Pause className="mr-2 h-4 w-4" /> Stop
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Start
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 shrink-0">
        <StatCard
          title="Active Usage"
          value={activeSessions.length}
          description="Apps currently using resources"
          icon={Activity}
        />
        <StatCard
          title="Permission Requests"
          value={permissionRequests.length}
          description="Access requests"
          icon={Lock}
        />
        <StatCard
          title="Total Events"
          value={events.length}
          description="All captured events"
          icon={History}
        />
        <StatCard
          title="Status"
          value={isMonitoring ? 'Active' : 'Inactive'}
          description="Monitoring engine"
          icon={Shield}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden grid gap-4 grid-rows-[auto_1fr]">
        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <Card className="shrink-0 max-h-[300px] flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Activity className="h-5 w-5" />
                Active Privacy Sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto no-scrollbar">
              <div className="space-y-2">
                {activeSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{serviceIcons[session.service] || '🔒'}</div>
                      <div>
                        <p className="font-medium">{session.appName}</p>
                        <p className="text-xs text-muted-foreground">{session.service}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant="outline"
                        className="mb-1 border-destructive/50 text-destructive"
                      >
                        Active: {formatDuration(session.duration)}
                      </Badge>
                      <p className="text-xs text-muted-foreground font-mono">PID: {session.pid}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Event History */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Event History
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto no-scrollbar">
            {events.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No events recorded yet.
              </div>
            ) : (
              <div className="divide-y">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-xl">{serviceIcons[event.service] || '🔒'}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{event.appName}</span>
                          <Badge
                            variant={event.allowed ? 'outline' : 'destructive'}
                            className="text-[10px] h-5"
                          >
                            {event.allowed ? 'Allowed' : 'Denied'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {event.path}
                        </div>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-xs font-mono text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {event.eventType === 'request' ? 'Request' : 'Usage'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
