import { app } from 'electron'
import { join } from 'path'

export const PROCESS_POLL_INTERVAL_MS = 1000
export const CONNECTION_POLL_INTERVAL_MS = 300
export const CONNECTION_SYNC_INTERVAL_MS = 1000
export const PACKET_PROCESS_INTERVAL_MS = 100
export const PROC_CON_SNAPSHOT_INTERVAL_MS = 5000
export const NETSTAT_TIMEOUT_MS = 5000
export const UDP_STALE_THRESHOLD_MS = 30_000
export const DEV_DATA_PATH = join(app.getAppPath(), 'dev-data')

export const systemProtocols = new Set(['ICMP', 'ICMPV6', 'IGMP', 'ARP'])
export const systemPorts = new Set([135, 137, 139, 445, 1900, 5355, 5353])