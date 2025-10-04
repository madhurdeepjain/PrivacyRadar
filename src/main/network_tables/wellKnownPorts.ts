export const WK_PORTS: Record<number, string> = {

  //Not Protocol Specific
  7: "Echo",
  9: "WoL",                           //Wake on Lan
  80: "HTTP",
  220: "IMAP",                        //Internet Message Access Protocol
  530: "RPC",                         //Remote Procedure Call
  546: "DHCPv6C",                     //DHCPv6 Client
  547: "DHCPv6S",                     //DHCPv6 Server
  554: "RTSP",                        //Real Time Streaming Protocol
  4500: "IPSECNAT",
  5004: "RTP",                        //Real Time Transfer Protocol
  5005: "RTCP",                       //RTP Control

  //TCP
  20: "FTP-Data",
  21: "FTP-Control",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  43: "WHOIS",
  53: "DNS",
  109: "POP2",                        //Post Office Protocol
  110: "POP3",
  115: "SFTP",                        //Simple File Transfer Protocol
  143: "IMAP",
  443: "HTTPS",
  3389: "RDP",
  3306: "MySQL",
  9150: "TOR",
  27017: "MongoDB",
  27018: "MongoDB-Alt",

  //UDP
  67: "DHCP-Server",
  68: "DHCP-Client",
  69: "TFTP",
  123: "NTP",                         //Network Time Protocol
  161: "SNMP",
  162: "SNMP-Trap",
  500: "ISAKMP",                      //Internet Key Exchange
  514: "Syslog",                      //Remote Shell / Syslog
  19302: "Google-STUN",               //Session Traversal Utils for NAT

}