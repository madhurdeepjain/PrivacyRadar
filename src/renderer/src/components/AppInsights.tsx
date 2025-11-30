import { useMemo } from 'react'
import { ArrowUpDown, Activity, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { AppStats } from '../types'

interface AppInsightsProps {
  apps: AppStats[]
}

export function AppInsights({ apps }: AppInsightsProps) {
  const topApps = useMemo(() => apps.slice(0, 8), [apps])

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp
    if (diff < 1000) return 'Just now'
    if (diff < 60000) return `${Math.round(diff / 1000)}s ago`
    return `${Math.round(diff / 60000)}m ago`
  }

  if (topApps.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            App Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center text-muted-foreground">
          No application activity detected yet
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Top Applications
          </CardTitle>
          <Badge variant="secondary">{apps.length} Active</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto no-scrollbar pr-2">
        <div className="space-y-4">
          {topApps.map((app, index) => (
            <div
              key={`${app.name}-${app.pid}`}
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {app.name.charAt(0).toUpperCase()}
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none">{app.name}</p>
                  <p className="text-xs text-muted-foreground">PID: {app.pid}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div className="space-y-0.5">
                  <div className="flex items-center justify-end gap-1 text-xs font-medium">
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    {formatBytes(app.totalBytes)}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {app.packetCount.toLocaleString()} pkts
                  </p>
                </div>
                <div className="hidden w-16 text-right text-xs text-muted-foreground sm:block">
                  <div className="flex items-center justify-end gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(app.lastSeen)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
