declare module 'cap' {
  type DecoderResult<T> = {
    info: T
    offset: number
  }

  export interface EthernetInfo {
    srcmac: string
    dstmac: string
    type: number
  }

  export interface IPv4Info {
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

  export interface IPv6Info {
    class: number
    flowLabel: number
    protocol: number
    hopLimit: number
    srcaddr: string
    dstaddr: string
    payloadlen: number
  }

  export interface TCPInfo {
    srcport: number
    dstport: number
    seqno: number
    ackno: number
    flags: number
    window: number
    checksum: number
  }

  export interface UDPInfo {
    srcport: number
    dstport: number
    length: number
    checksum: number
  }

  export class Cap {
    open(device: string, filter: string, bufferSize: number, buffer: Buffer): number
    close(): void
    on(event: 'packet', listener: (nbytes: number, truncated: number, buffer: Buffer) => void): void
  }

  export const decoders: {
    PROTOCOL: {
      ETHERNET: {
        IPV4: number
        IPV6: number
      }
    }
    Ethernet(buffer: Buffer, offset: number): DecoderResult<EthernetInfo>
    IPV4(buffer: Buffer, offset: number): DecoderResult<IPv4Info>
    IPV6(buffer: Buffer, offset: number): DecoderResult<IPv6Info>
    TCP(buffer: Buffer, offset: number): DecoderResult<TCPInfo>
    UDP(buffer: Buffer, offset: number): DecoderResult<UDPInfo>
  }

  export function deviceList(): Array<{
    name: string
    description: string
    addresses?: Array<{ addr: string }>
  }>
}
