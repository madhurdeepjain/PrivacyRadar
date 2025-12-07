export interface Device {
  os: string
  interfaces: NetworkInterface[]
  bestInterface?: NetworkInterface
  mac?: string
}

export interface NetworkInterface {
  name: string
  description: string
  addresses: string[]
  friendlyName?: string
}

export interface ProcDetails {
  pid: number
  name: string
  cmd?: string
  cpu?: number
  memory?: number
  ppid?: number
}

export interface PacketMetadata {
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
  appRegistryID?: string
  appName?: string
  appDisplayName?: string
  appInstance?: string
  ethernet: EthernetFrame
  ipv4?: IPv4Header
  ipv6?: IPv6Header
  tcp?: TCPHeader
  udp?: UDPHeader
  payload?: string
  icmp?: ICMPHeader
}

export interface NetworkConnection {
  pid?: number
  procName: string
  srcaddr?: string
  srcport?: number
  dstaddr?: string
  dstport?: number
  protocol: string
  state: string
}

export interface UDPPortMapping {
  port: number
  address: string
  pid?: number
  procName: string
  lastSeen: number
  isListener: boolean
}

export interface EthernetFrame {
  srcmac: string
  dstmac: string
  type: number
}

export interface IPv4Header {
  hdrlen: number
  dscp: number
  ecn: number
  totallen: number
  id: number
  flags: number
  fragoffset: number
  ttl: number
  protocol: number
  hdrchecksum: number
  srcaddr: string
  dstaddr: string
}

export interface IPv6Header {
  class: number
  flowLabel: number
  protocol: number
  hoplimit: number
  srcaddr: string
  dstaddr: string
  payloadlen: number
}

export interface TCPHeader {
  srcport: number
  dstport: number
  seqno: number
  ackno: number
  flags: number
  window: number
  checksum: number
}

export interface UDPHeader {
  srcport: number
  dstport: number
  length: number
  checksum: number
}

export interface ICMPHeader {
  type: number
  code: number
  checksum: number
  id?: number
  seq?: number
}

export interface GlobalRegistry {
  interfaceName: string
  totalPackets: number
  totalBytesSent: number
  totalBytesReceived: number
  ipv4Packets: number
  ipv6Packets: number
  tcpPackets: number
  udpPackets: number
  ipv4Percent: number
  ipv6Percent: number
  tcpPercent: number
  udpPercent: number
  inboundBytes: number
  outboundBytes: number
  firstSeen: number
  lastSeen: number
}

export interface ApplicationRegistry {
  appName: string
  appDisplayName: string
  totalPackets: number
  totalBytesSent: number
  totalBytesReceived: number
  inboundBytes: number
  outboundBytes: number
  ipv4Packets: number
  ipv6Packets: number
  tcpPackets: number
  udpPackets: number
  ipv4Percent: number
  ipv6Percent: number
  tcpPercent: number
  udpPercent: number
  uniqueRemoteIPs: Set<string>
  uniqueDomains: Set<string>
  geoLocations: GeoLocationData[]
  interfaceStats: Map<
    string,
    {
      packets: number
      bytesSent: number
      bytesReceived: number
    }
  >
  firstSeen: number
  lastSeen: number
  processRegistryIDs: string[]
  processCount: number
}

export interface ProcessRegistry {
  id: string
  appName: string
  pid: number
  parentPID: number
  procName: string
  exePath?: string
  isRootProcess: boolean
  totalPackets: number
  totalBytesSent: number
  totalBytesReceived: number
  inboundBytes: number
  outboundBytes: number
  ipv4Packets: number
  ipv6Packets: number
  tcpPackets: number
  udpPackets: number
  ipv4Percent: number
  ipv6Percent: number
  tcpPercent: number
  udpPercent: number
  uniqueRemoteIPs: Set<string>
  geoLocations: GeoLocationData[]
  interfaceStats: Map<
    string,
    {
      packets: number
      bytesSent: number
      bytesReceived: number
    }
  >

  firstSeen: number
  lastSeen: number
}

export interface EmptyStats {
  totalPackets: number
  totalBytesSent: number
  totalBytesReceived: number
  inboundBytes: number
  outboundBytes: number
  ipv4Packets: number
  ipv6Packets: number
  tcpPackets: number
  udpPackets: number
  ipv4Percent: number
  ipv6Percent: number
  tcpPercent: number
  udpPercent: number
}

export interface GeoLocationResponse {
  country?: string
  region?: string
  regionName?: string
  city?: string
  zip?: string
  lat?: number
  lon?: number
  timezone?: string
  isp?: string
  org?: string
  as?: string
  asname?: string
  mobile?: boolean
  proxy?: boolean
  hosting?: boolean
}

export interface GeoLocationData {
  country?: string
  region?: string
  regionName?: string
  city?: string
  zip?: string
  lat?: number
  lon?: number
  timezone?: string
  isp?: string
  org?: string
  as?: string
  asname?: string
  mobile?: boolean
  proxy?: boolean
  hosting?: boolean
  ips?: string[]
  packetCount: number
  bytesSent: number
  bytesReceived: number
}

export interface ProcessTree {
  rootPid: number
  rootName: string
  children: Set<number>
}

// TCC (Transparency, Consent, and Control) Privacy Monitoring
export interface TCCEvent {
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
  // Event type: 'request' = asking for permission, 'usage' = actively using resource
  eventType: 'request' | 'usage'
  // Session tracking (only for usage events)
  sessionStart?: Date
  sessionEnd?: Date
  duration?: number // in seconds
}
