export const WK_PORTS: Record<number, string> = {
  // Not protocol specific
  7: 'Echo',
  9: 'WoL',
  80: 'HTTP',
  220: 'IMAP',
  530: 'RPC',
  546: 'DHCPv6C',
  547: 'DHCPv6S',
  554: 'RTSP',
  4500: 'IPSECNAT',
  5004: 'RTP',
  5005: 'RTCP',

  // TCP
  20: 'FTP-Data',
  21: 'FTP-Control',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  43: 'WHOIS',
  53: 'DNS',
  109: 'POP2',
  110: 'POP3',
  115: 'SFTP',
  143: 'IMAP',
  443: 'HTTPS',
  3389: 'RDP',
  3306: 'MySQL',
  9150: 'TOR',
  27017: 'MongoDB',
  27018: 'MongoDB-Alt',

  // UDP
  67: 'DHCP-Server',
  68: 'DHCP-Client',
  69: 'TFTP',
  123: 'NTP',
  161: 'SNMP',
  162: 'SNMP-Trap',
  500: 'ISAKMP',
  514: 'Syslog',
  19302: 'Google-STUN'
}
