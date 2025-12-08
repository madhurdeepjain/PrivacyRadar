import * as React from 'react'
import { useRef, useEffect } from 'react'
import { Network, ArrowUpDown, ArrowRight, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { PacketMetadata } from '../types'

interface ActivityListProps {
  packets: PacketMetadata[]
  className?: string
}

export function ActivityList({ packets, className }: ActivityListProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current && packets.length > 0) {
      listRef.current.scrollTop = 0 // Newest at top
    }
  }, [packets.length])

  const formatTime = (timestamp: number): string => new Date(timestamp).toLocaleTimeString()

  const getSource = (p: PacketMetadata): string =>
    p.srcIP || p.ipv4?.srcaddr || p.ipv6?.srcaddr || 'Unknown'
  const getDest = (p: PacketMetadata): string =>
    p.dstIP || p.ipv4?.dstaddr || p.ipv6?.dstaddr || 'Unknown'
  const getProto = (p: PacketMetadata): string => p.protocol || '??'

  const toggleTable = (tableId: string, buttonId: string): void => {
    const table = document.getElementById(tableId)
    const button = document.getElementById(buttonId)
    if (table) {
      if (table.style.display === 'table') {
        table.style.display = 'none'
        if (button) {
          const classList =
            'bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2'.split(' ')
          for (const className of classList) {
            button.classList.remove(className)
          }
          const newClassList =
            'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2'.split(
              ' '
            )
          for (const newClass of newClassList) {
            button.classList.add(newClass)
          }
        }
      } else {
        table.style.display = 'table'
        if (button) {
          const classList =
            'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2'.split(
              ' '
            )
          for (const className of classList) {
            button.classList.remove(className)
          }
          const newClassList =
            'bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2'.split(' ')
          for (const newClass of newClassList) {
            button.classList.add(newClass)
          }
        }
      }
    }
  }

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
            <div key={`${packet.timestamp}-${i}`}>
              <div className="flex items-center justify-between p-3 text-sm hover:bg-muted/50 transition-colors animate-in fade-in slide-in-from-top-1 duration-300">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{packet.procName || 'System'}</span>
                      <span className="bg-success-soft border border-success-subtle text-fg-success-strong text-xs font-medium px-1.5 py-0.5 rounded">
                        {getProto(packet)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono truncate">
                      <span>{getSource(packet)}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{getDest(packet)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {packet.ethernet && (
                    <button
                      id={`ethernet-button-${i}`}
                      type="button"
                      className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                      onClick={() => toggleTable(`ethernet-${i}`, `ethernet-button-${i}`)}
                    >
                      Ethernet
                    </button>
                  )}
                  {packet.ipv4 && (
                    <button
                      id={`ipv4-button-${i}`}
                      type="button"
                      className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                      onClick={() => toggleTable(`ipv4-${i}`, `ipv4-button-${i}`)}
                    >
                      IPv4
                    </button>
                  )}
                  {packet.ipv6 && (
                    <button
                      id={`ipv6-button-${i}`}
                      type="button"
                      className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                      onClick={() => toggleTable(`ipv6-${i}`, `ipv6-button-${i}`)}
                    >
                      IPv6
                    </button>
                  )}
                  {packet.tcp && (
                    <button
                      id={`tcp-button-${i}`}
                      type="button"
                      className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                      onClick={() => toggleTable(`tcp-${i}`, `tcp-button-${i}`)}
                    >
                      TCP
                    </button>
                  )}
                  {packet.udp && (
                    <button
                      id={`udp-button-${i}`}
                      type="button"
                      className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                      onClick={() => toggleTable(`udp-${i}`, `udp-button-${i}`)}
                    >
                      UDP
                    </button>
                  )}
                  {packet.icmp && (
                    <button
                      id={`icmp-button-${i}`}
                      type="button"
                      className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                      onClick={() => toggleTable(`icmp-${i}`, `icmp-button-${i}`)}
                    >
                      ICMP
                    </button>
                  )}
                  {packet.payload && (
                    <button
                      id={`payload-button-${i}`}
                      type="button"
                      className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                      onClick={() => toggleTable(`payload-${i}`, `payload-button-${i}`)}
                    >
                      Payload
                    </button>
                  )}
                  <div className="flex items-center gap-1 w-30 justify-end">
                    <Clock className="h-3 w-3" />
                    {formatTime(packet.timestamp)}
                  </div>
                </div>
              </div>
              {packet.ethernet && (
                <table
                  className="w-full text-sm text-left rtl:text-right text-body hidden"
                  id={`ethernet-${i}`}
                >
                  <caption className="p-5 text-lg font-medium text-left rtl:text-right text-heading">
                    Ethernet
                  </caption>
                  <thead>
                    <tr className="odd:bg-neutral-primary even:bg-neutral-secondary-soft border-b border-default">
                      <th scope="col" className="px-6 py-3 font-medium">
                        Ethernet Type
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Source MAC
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Destination MAC
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-neutral-primary border-b border-default">
                      <td className="px-6 py-4">{packet.ethernet.type}</td>
                      <td className="px-6 py-4">{packet.ethernet.srcmac}</td>
                      <td className="px-6 py-4">{packet.ethernet.dstmac}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {packet.ipv4 && (
                <table
                  className="w-full text-sm text-left rtl:text-right text-body hidden"
                  id={`ipv4-${i}`}
                >
                  <caption className="p-5 text-lg font-medium text-left rtl:text-right text-heading">
                    IPv4 Header
                  </caption>
                  <thead>
                    <tr className="odd:bg-neutral-primary even:bg-neutral-secondary-soft border-b border-default">
                      <th scope="col" className="px-6 py-3 font-medium">
                        ID
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        DSCP
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        ECN
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Total Length
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Flags
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Fragment Offset
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Source Address
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Destination Address
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        TTL
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Header Checksum
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Protocol
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Header Length
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-neutral-primary border-b border-default">
                      <td className="px-6 py-4">{packet.ipv4.id}</td>
                      <td className="px-6 py-4">{packet.ipv4.dscp}</td>
                      <td className="px-6 py-4">{packet.ipv4.ecn}</td>
                      <td className="px-6 py-4">{packet.ipv4.totallen}</td>
                      <td className="px-6 py-4">{packet.ipv4.flags}</td>
                      <td className="px-6 py-4">{packet.ipv4.fragoffset}</td>
                      <td className="px-6 py-4">{packet.ipv4.srcaddr}</td>
                      <td className="px-6 py-4">{packet.ipv4.dstaddr}</td>
                      <td className="px-6 py-4">{packet.ipv4.ttl}</td>
                      <td className="px-6 py-4">{packet.ipv4.hdrchecksum}</td>
                      <td className="px-6 py-4">{packet.ipv4.protocol}</td>
                      <td className="px-6 py-4">{packet.ipv4.hdrlen}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {packet.ipv6 && (
                <table
                  className="w-full text-sm text-left rtl:text-right text-body hidden"
                  id={`ipv6-${i}`}
                >
                  <caption className="p-5 text-lg font-medium text-left rtl:text-right text-heading">
                    IPv6 Header
                  </caption>
                  <thead>
                    <tr className="odd:bg-neutral-primary even:bg-neutral-secondary-soft border-b border-default">
                      <th scope="col" className="px-6 py-3 font-medium">
                        Class
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Flow Label
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Protocol
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Hoplimit
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Source Address
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Destination Address
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Payload Length
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-neutral-primary border-b border-default">
                      <td className="px-6 py-4">{packet.ipv6.class}</td>
                      <td className="px-6 py-4">{packet.ipv6.flowLabel}</td>
                      <td className="px-6 py-4">{packet.ipv6.protocol}</td>
                      <td className="px-6 py-4">{packet.ipv6.hoplimit}</td>
                      <td className="px-6 py-4">{packet.ipv6.srcaddr}</td>
                      <td className="px-6 py-4">{packet.ipv6.dstaddr}</td>
                      <td className="px-6 py-4">{packet.ipv6.payloadlen}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {packet.tcp && (
                <table
                  className="w-full text-sm text-left rtl:text-right text-body hidden"
                  id={`tcp-${i}`}
                >
                  <caption className="p-5 text-lg font-medium text-left rtl:text-right text-heading">
                    TCP Header
                  </caption>
                  <thead>
                    <tr className="odd:bg-neutral-primary even:bg-neutral-secondary-soft border-b border-default">
                      <th scope="col" className="px-6 py-3 font-medium">
                        Source Port
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Destination Port
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Sequence Number
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Acknowledgment Number
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Flags
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Window Size
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Checksum
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-neutral-primary border-b border-default">
                      <td className="px-6 py-4">{packet.tcp.srcport}</td>
                      <td className="px-6 py-4">{packet.tcp.dstport}</td>
                      <td className="px-6 py-4">{packet.tcp.seqno}</td>
                      <td className="px-6 py-4">{packet.tcp.ackno}</td>
                      <td className="px-6 py-4">{packet.tcp.flags}</td>
                      <td className="px-6 py-4">{packet.tcp.window}</td>
                      <td className="px-6 py-4">{packet.tcp.checksum}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {packet.udp && (
                <table
                  className="w-full text-sm text-left rtl:text-right text-body hidden"
                  id={`udp-${i}`}
                >
                  <caption className="p-5 text-lg font-medium text-left rtl:text-right text-heading">
                    UDP Header
                  </caption>
                  <thead>
                    <tr className="odd:bg-neutral-primary even:bg-neutral-secondary-soft border-b border-default">
                      <th scope="col" className="px-6 py-3 font-medium">
                        Source Port
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Destination Port
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Length
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Checksum
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-neutral-primary border-b border-default">
                      <td className="px-6 py-4">{packet.udp.srcport}</td>
                      <td className="px-6 py-4">{packet.udp.dstport}</td>
                      <td className="px-6 py-4">{packet.udp.length}</td>
                      <td className="px-6 py-4">{packet.udp.checksum}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {packet.icmp && (
                <table
                  className="w-full text-sm text-left rtl:text-right text-body hidden"
                  id={`icmp-${i}`}
                >
                  <caption className="p-5 text-lg font-medium text-left rtl:text-right text-heading">
                    ICMP Header
                  </caption>
                  <thead>
                    <tr className="odd:bg-neutral-primary even:bg-neutral-secondary-soft border-b border-default">
                      <th scope="col" className="px-6 py-3 font-medium">
                        ID
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Type
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Code
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Checksum
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Sequence Number
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-neutral-primary border-b border-default">
                      <td className="px-6 py-4">{packet.icmp.id}</td>
                      <td className="px-6 py-4">{packet.icmp.type}</td>
                      <td className="px-6 py-4">{packet.icmp.code}</td>
                      <td className="px-6 py-4">{packet.icmp.checksum}</td>
                      <td className="px-6 py-4">{packet.icmp.seq}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {packet.payload && (
                <table
                  className="w-full text-sm text-left rtl:text-right text-body hidden"
                  id={`payload-${i}`}
                >
                  <caption className="p-5 text-lg font-medium text-left rtl:text-right text-heading">
                    Payload
                  </caption>
                  <thead>
                    <tr className="odd:bg-neutral-primary even:bg-neutral-secondary-soft border-b border-default">
                      <th scope="col" className="px-6 py-3 font-medium">
                        Payload (Hex)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-neutral-primary border-b border-default">
                      <td className="px-6 py-4">{packet.payload}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
