export interface InterfaceOption {
  name: string
  description: string
  addresses: string[]
  friendlyName?: string
}

export type InterfaceSelectionResult = {
  interfaces: InterfaceOption[]
  selectedInterfaceNames: string[]
  isCapturing: boolean
}

export interface PacketData {
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
  ipv4?: {
    srcaddr: string
    dstaddr: string
  }
  ipv6?: {
    srcaddr: string
    dstaddr: string
  }
  tcp?: {
    srcport: number
    dstport: number
  }
  udp?: {
    srcport: number
    dstport: number
  }
}

export interface AppStats {
  name: string
  pid?: number
  packetCount: number
  totalBytes: number
  lastSeen: number
}
