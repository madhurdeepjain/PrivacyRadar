import * as cap from 'cap'
import { PacketMetadata } from '@shared/interfaces/common'
import { formatIPv6Address } from '@shared/utils/address-normalizer'
import { ETHERTYPES } from '@shared/lookups/ethertypes'
import { IP_PROTOCOLS } from '@shared/lookups/ip-protocols'
import { WK_PORTS } from '@shared/lookups/well-known-ports'

export class PacketDecoder {
  private readonly decoders = cap.decoders
  private readonly PROTOCOL = this.decoders.PROTOCOL

  decode(buffer: Buffer, nbytes: number): PacketMetadata {
    const eth = this.decoders.Ethernet(buffer, 0)
    const protoName = ETHERTYPES[eth.info.type]?.toUpperCase() ?? 'Unknown'

    const metadata: PacketMetadata = {
      size: nbytes,
      ethernet: {
        srcmac: eth.info.srcmac,
        dstmac: eth.info.dstmac,
        type: eth.info.type
      },
      protocol: protoName,
      srcPortService: 'Unknown service',
      dstPortService: 'unknown service',
      timestamp: Date.now()
    }

    let ipOffset = eth.offset
    let ipProtocol: number | null = null
    let payloadOffset = ipOffset

    if (eth.info.type === this.PROTOCOL.ETHERNET.IPV4) {
      const ipv4 = this.decoders.IPV4(buffer, ipOffset)
      metadata.srcIP = ipv4.info.srcaddr
      metadata.dstIP = ipv4.info.dstaddr
      metadata.ipv4 = {
        hdrlen: ipv4.info.hdrlen,
        dscp: ipv4.info.dscp,
        ecn: ipv4.info.ecn,
        totallen: ipv4.info.totallen,
        id: ipv4.info.id,
        flags: ipv4.info.flags,
        fragoffset: ipv4.info.fragoffset,
        ttl: ipv4.info.ttl,
        protocol: ipv4.info.protocol,
        hdrchecksum: ipv4.info.hdrchecksum,
        srcaddr: ipv4.info.srcaddr,
        dstaddr: ipv4.info.dstaddr
      }
      ipProtocol = ipv4.info.protocol
      ipOffset = ipv4.offset
      payloadOffset = ipv4.offset
    } else if (eth.info.type === this.PROTOCOL.ETHERNET.IPV6) {
      const ipv6 = this.decoders.IPV6(buffer, ipOffset)
      metadata.srcIP = formatIPv6Address(ipv6.info.srcaddr)
      metadata.dstIP = formatIPv6Address(ipv6.info.dstaddr)
      metadata.ipv6 = {
        class: ipv6.info.class,
        flowLabel: ipv6.info.flowLabel,
        protocol: ipv6.info.protocol,
        hoplimit: ipv6.info.hopLimit,
        srcaddr: metadata.srcIP,
        dstaddr: metadata.dstIP,
        payloadlen: ipv6.info.payloadlen
      }
      ipProtocol = ipv6.info.protocol
      ipOffset = ipv6.offset
      payloadOffset = ipv6.offset
    }

    if (ipProtocol === 6) {
      const tcp = this.decoders.TCP(buffer, ipOffset)
      metadata.tcp = {
        srcport: tcp.info.srcport,
        dstport: tcp.info.dstport,
        seqno: tcp.info.seqno,
        ackno: tcp.info.ackno,
        flags: tcp.info.flags,
        window: tcp.info.window,
        checksum: tcp.info.checksum
      }
      metadata.srcport = tcp.info.srcport
      metadata.dstport = tcp.info.dstport
      metadata.protocol = 'tcp'
      metadata.srcPortService = WK_PORTS[tcp.info.srcport] ?? 'Unknown'
      metadata.dstPortService = WK_PORTS[tcp.info.dstport] ?? 'Unknown'
      payloadOffset = tcp.offset
    } else if (ipProtocol === 17) {
      const udp = this.decoders.UDP(buffer, ipOffset)
      metadata.udp = {
        srcport: udp.info.srcport,
        dstport: udp.info.dstport,
        length: udp.info.length,
        checksum: udp.info.checksum
      }
      metadata.srcport = udp.info.srcport
      metadata.dstport = udp.info.dstport
      metadata.srcPortService = WK_PORTS[udp.info.srcport] ?? 'Unknown'
      metadata.dstPortService = WK_PORTS[udp.info.dstport] ?? 'Unknown'
      metadata.protocol = 'udp'
      payloadOffset = udp.offset
    } else if (ipProtocol !== null) {
      metadata.protocol = IP_PROTOCOLS[ipProtocol]?.toUpperCase() ?? `IP-${ipProtocol}`
    }

    if (payloadOffset < nbytes) {
      metadata.payload = buffer.slice(payloadOffset, nbytes).toString('hex')
    }

    return metadata
  }
}
