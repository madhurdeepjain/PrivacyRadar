export const WK_PORTS: Record<number, string> = {
  // Discovery & Local Network
  137: 'NetBIOS-NS',
  138: 'NetBIOS-DGM',
  139: 'NetBIOS-SSN',
  445: 'SMB',
  1900: 'SSDP',
  3702: 'WS-Discovery',
  5353: 'MDNS',
  5355: 'LLMNR',
  5357: 'WSDAPI',
  5358: 'WSDAPI-S',

  // Core Network Services
  7: 'Echo',
  9: 'WoL',
  53: 'DNS',
  67: 'DHCP-Server',
  68: 'DHCP-Client',
  69: 'TFTP',
  123: 'NTP',
  161: 'SNMP',
  162: 'SNMP-Trap',
  500: 'ISAKMP',
  514: 'Syslog',
  546: 'DHCPv6C',
  547: 'DHCPv6S',
  4500: 'IPSECNAT',

  // File Transfer & Remote Access (TCP)
  20: 'FTP-Data',
  21: 'FTP-Control',
  22: 'SSH',
  23: 'Telnet',
  115: 'SFTP',
  548: 'AFP',
  2049: 'NFS',
  3389: 'RDP',
  5900: 'VNC',

  // Email (TCP)
  25: 'SMTP',
  109: 'POP2',
  110: 'POP3',
  143: 'IMAP',
  220: 'IMAP',
  465: 'SMTPS',
  587: 'SMTP-Submit',
  993: 'IMAPS',
  995: 'POP3S',

  // Web & HTTP
  80: 'HTTP',
  443: 'HTTPS',
  8000: 'HTTP-Alt',
  8008: 'HTTP-Alt',
  8080: 'HTTP-Proxy',
  8443: 'HTTPS-Alt',
  3000: 'Dev-Server',
  3001: 'Dev-Server',
  5000: 'Flask-Dev',
  5173: 'Vite-Dev',

  // VoIP & Real-Time Communication
  530: 'RPC',
  554: 'RTSP',
  1935: 'RTMP',
  3478: 'STUN',
  3479: 'STUN-Alt',
  5004: 'RTP',
  5005: 'RTCP',
  5060: 'SIP',
  5061: 'SIP-TLS',
  19302: 'Google-STUN',

  // Databases
  1433: 'MSSQL',
  1521: 'Oracle',
  3306: 'MySQL',
  5432: 'PostgreSQL',
  6379: 'Redis',
  27017: 'MongoDB',
  27018: 'MongoDB-Alt',
  28017: 'MongoDB-Web',

  // Security & VPN
  1194: 'OpenVPN',
  1701: 'L2TP',
  1723: 'PPTP',
  51820: 'WireGuard',

  // P2P & File Sharing
  6881: 'BitTorrent',
  6882: 'BitTorrent',
  6883: 'BitTorrent',
  6884: 'BitTorrent',
  6885: 'BitTorrent',
  6889: 'BitTorrent',

  // Gaming & Entertainment
  25565: 'Minecraft',
  27015: 'Steam-Source',
  3074: 'Xbox-Live',

  // Apple Services (macOS/iOS)
  3283: 'Apple-NetAssist',
  7000: 'AirPlay-Audio',
  62078: 'Apple-iCloud',

  // Linux/Unix Services
  631: 'IPP',
  873: 'rsync',

  // Other Application Services
  43: 'WHOIS',
  1883: 'MQTT',
  5222: 'XMPP-Client',
  5223: 'XMPP-Client-SSL',
  5269: 'XMPP-Server',
  8883: 'MQTT-SSL',
  9150: 'TOR',
  9418: 'Git',
  11211: 'Memcached'
}
