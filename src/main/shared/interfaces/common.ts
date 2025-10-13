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
