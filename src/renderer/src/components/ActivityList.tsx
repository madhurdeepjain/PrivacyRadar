import { useRef, useEffect } from 'react'
import { ArrowRight, Clock, Network, Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { PacketData } from '../types'

interface ActivityListProps {
  packets: PacketData[]
  className?: string
}

export function ActivityList({ packets, className }: ActivityListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current && packets.length > 0) {
      listRef.current.scrollTop = 0 // Newest at top
    }
  }, [packets.length])

  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString()

  const getSource = (p: PacketData) => p.srcIP || p.ipv4?.srcaddr || p.ipv6?.srcaddr || 'Unknown'
  const getDest = (p: PacketData) => p.dstIP || p.ipv4?.dstaddr || p.ipv6?.dstaddr || 'Unknown'
  const getProto = (p: PacketData) => p.protocol || '??'

  if (packets.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Live Traffic
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-[400px] items-center justify-center text-muted-foreground">
          Waiting for network activity...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Live Traffic
          </CardTitle>
          <Badge variant="outline" className="font-mono text-xs">
            {packets.length} events
          </Badge>
        </div>
      </CardHeader>
      <div className="flex-1 overflow-auto no-scrollbar" ref={listRef}>
        <div className="divide-y">
          {packets.map((packet, i) => (
            <div
              key={`${packet.timestamp}-${i}`}
              className="flex items-center justify-between p-3 text-sm hover:bg-muted/50 transition-colors animate-in fade-in slide-in-from-top-1 duration-300"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <Shield className="h-4 w-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {packet.procName || 'System'}
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1 h-4">
                      {getProto(packet)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono truncate">
                    <span>{getSource(packet)}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>{getDest(packet)}</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{packet.size} B</span>
                <div className="flex items-center gap-1 w-16 justify-end">
                  <Clock className="h-3 w-3" />
                  {formatTime(packet.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
