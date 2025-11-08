import { app } from 'electron'
import { join } from 'path'

export const PROCESS_POLL_INTERVAL_MS = 1000
export const CONNECTION_POLL_INTERVAL_MS = 300
export const CONNECTION_SYNC_INTERVAL_MS = 1000
export const PACKET_PROCESS_INTERVAL_MS = 100
export const PROC_CON_SNAPSHOT_INTERVAL_MS = 5000
export const NETSTAT_TIMEOUT_MS = 5000
export const UDP_STALE_THRESHOLD_MS = 30_000
export const DEV_DATA_PATH = join(app.getAppPath(), '.dev-data')

export const SYSTEM_PROTOCOLS = new Set(['arp', 'icmp', 'icmpv6', 'igmp', 'dhcp', 'dhcpv6'])

export const SYSTEM_PORTS = new Set([53, 67, 68, 123, 137, 138, 139, 161, 162, 514, 546, 547])

export const TCP_STATES = new Set([
  'ESTABLISHED',
  'CLOSE_WAIT',
  'FIN_WAIT1',
  'FIN_WAIT2',
  'CLOSING',
  'LAST_ACK'
])
