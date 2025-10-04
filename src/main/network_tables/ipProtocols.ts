export const IP_PROTOCOLS: Record<number, string> = {

  1: "ICMP",              // Internet Control Message Protocol
  2: "IGMP",              // Internet Group Management Protocol
  6: "TCP",               // Transmission Control Protocol
  17: "UDP",              // User Datagram Protocol
  41: "IPv6",             // IPv6 encapsulation
  47: "GRE",              // Generic Routing Encapsulation
  50: "ESP",              // Encapsulating Security Payload (IPsec)
  51: "AH",               // Authentication Header (IPsec)
  58: "ICMPv6",
  88: "EIGRP",            // Cisco EIGRP
  89: "OSPF",             // Open Shortest Path First
  132: "SCTP",            // Stream Control Transmission Protocol
  136: "UDPLite"
}