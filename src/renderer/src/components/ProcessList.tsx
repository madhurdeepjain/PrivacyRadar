import * as React from 'react'
import { useRef, useEffect } from 'react'
import { Cpu } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { ProcessRegistry } from '../types'

export function ProcessList({
  registries
}: {
  registries: Array<Map<string, ProcessRegistry>>
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (listRef.current && registries[registries.length - 1].size > 0) {
      listRef.current.scrollTop = 0 // Newest at top
    }
  }, [registries])

  const formatTime = (timestamp: number): string => new Date(timestamp).toLocaleTimeString()

  if (registries[registries.length - 1].size === 0) {
    return (
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Live Process Traffic
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-[400px] items-center justify-center text-muted-foreground">
          Waiting for process network activity...
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="flex-1 flex flex-col min-h-0">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Live Process Traffic
          </CardTitle>
          <Badge variant="outline" className="font-mono text-xs">
            {registries[registries.length - 1].size} events
          </Badge>
        </div>
      </CardHeader>
      <div className="flex-1 overflow-auto no-scrollbar" ref={listRef}>
        <div className="divide-y">
          <div className="relative bg-neutral-primary-soft shadow-xs rounded-base border border-default">
            <table className="w-full text-sm text-left rtl:text-right text-body">
              <thead className="text-sm text-body bg-neutral-secondary-soft border-b rounded-base border-default">
                <tr>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Time
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Application
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium">
                    PID
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Total Packets
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Bytes Sent
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Bytes Received
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Geo Locations
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(registries[registries.length - 1].values())
                  .sort((a, b) => b.totalPackets - a.totalPackets)
                  .map((registry, i) => (
                    <tr key={i} className="bg-neutral-primary border-b border-default">
                      <th
                        scope="row"
                        className="px-6 py-4 font-medium text-heading whitespace-nowrap"
                      >
                        {formatTime(registry.lastSeen)}
                      </th>
                      <td className="px-6 py-4">{registry.procName || 'System'}</td>
                      <td className="px-6 py-4">{registry.pid || 'Unknown'}</td>
                      <td className="px-6 py-4">{registry.totalPackets}</td>
                      <td className="px-6 py-4">{registry.totalBytesSent}</td>
                      <td className="px-6 py-4">{registry.totalBytesReceived}</td>
                      <td className="px-6 py-4">
                        {registry.geoLocations
                          .map((loc) => `${loc.city}, ${loc.country}`)
                          .join('; ')}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  )
}
