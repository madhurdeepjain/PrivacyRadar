import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'crypto'

export const settings = sqliteTable('settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
})

export const globalSnapshots = sqliteTable('global_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  interfaceName: text('interface_name').notNull(),
  totalPackets: integer('total_packets').notNull().default(0),
  totalBytesSent: integer('total_bytes_sent').notNull().default(0),
  totalBytesReceived: integer('total_bytes_recvd').notNull().default(0),
  ipv4Packets: integer('ipv4_packets').notNull().default(0),
  ipv6Packets: integer('ipv6_packets').notNull().default(0),
  tcpPackets: integer('tcp_packets').notNull().default(0),
  udpPackets: integer('udp_packets').notNull().default(0),
  ipv4Percent: integer('ipv4_percent').notNull().default(0),
  ipv6Percent: integer('ipv6_percent').notNull().default(0),
  tcpPercent: integer('tcp_percent').notNull().default(0),
  udpPercent: integer('udp_percent').notNull().default(0),
  inboundBytes: integer('inbound_bytes').notNull().default(0),
  outboundBytes: integer('outbound_bytes').notNull().default(0),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull(),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull()
})

export const applicationSnapshots = sqliteTable('application_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  appName: text('app_name').notNull(),
  appDisplayName: text('app_display_name').notNull(),
  totalPackets: integer('total_packets').notNull().default(0),
  totalBytesSent: integer('total_bytes_sent').notNull().default(0),
  totalBytesReceived: integer('total_bytes_received').notNull().default(0),
  inboundBytes: integer('inbound_bytes').notNull().default(0),
  outboundBytes: integer('outbound_bytes').notNull().default(0),
  ipv4Packets: integer('ipv4_packets').notNull().default(0),
  ipv6Packets: integer('ipv6_packets').notNull().default(0),
  tcpPackets: integer('tcp_packets').notNull().default(0),
  udpPackets: integer('udp_packets').notNull().default(0),
  ipv4Percent: integer('ipv4_percent').notNull().default(0),
  ipv6Percent: integer('ipv6_percent').notNull().default(0),
  tcpPercent: integer('tcp_percent').notNull().default(0),
  udpPercent: integer('udp_percent').notNull().default(0),
  processCount: integer('process_count').notNull().default(0),
  processRegistryIDs: text('process_registry_ids', { mode: 'json' }),
  uniqueRemoteIPs: text('unique_remote_ips', { mode: 'json' }),
  uniqueDomains: text('unique_domains', { mode: 'json' }),
  geoLocations: text('geo_locations', { mode: 'json' }),
  interfaceStats: text('interface_stats', { mode: 'json' }),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull(),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull()
})

export const processSnapshots = sqliteTable('process_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  processId: text('process_id').notNull(),
  appName: text('app_name').notNull(),
  pid: integer('pid').notNull(),
  parentPID: integer('parent_pid').notNull(),
  procName: text('proc_name').notNull(),
  exePath: text('exe_path'),
  isRootProcess: integer('is_root_process', { mode: 'boolean' }).notNull(),
  totalPackets: integer('total_packets').notNull().default(0),
  totalBytesSent: integer('total_bytes_sent').notNull().default(0),
  totalBytesReceived: integer('total_bytes_received').notNull().default(0),
  inboundBytes: integer('inbound_bytes').notNull().default(0),
  outboundBytes: integer('outbound_bytes').notNull().default(0),
  ipv4Packets: integer('ipv4_packets').notNull().default(0),
  ipv6Packets: integer('ipv6_packets').notNull().default(0),
  tcpPackets: integer('tcp_packets').notNull().default(0),
  udpPackets: integer('udp_packets').notNull().default(0),
  ipv4Percent: integer('ipv4_percent').notNull().default(0),
  ipv6Percent: integer('ipv6_percent').notNull().default(0),
  tcpPercent: integer('tcp_percent').notNull().default(0),
  udpPercent: integer('udp_percent').notNull().default(0),
  uniqueRemoteIPs: text('unique_remote_ips', { mode: 'json' }),
  geoLocations: text('geo_locations', { mode: 'json' }),
  interfaceStats: text('interface_stats', { mode: 'json' }),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull(),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull()
})

export const globalSnapshotsTimestampIdx = index('global_snapshots_timestamp_idx').on(
  globalSnapshots.timestamp
)

export const appSnapshotsAppNameIdx = index('app_snapshots_app_name_idx').on(
  applicationSnapshots.appName
)

export const appSnapshotsTimestampIdx = index('app_snapshots_timestamp_idx').on(
  applicationSnapshots.timestamp
)

export const processSnapshotsAppNameIdx = index('process_snapshots_app_name_idx').on(
  processSnapshots.appName
)

export const processSnapshotsTimestampIdx = index('process_snapshots_timestamp_idx').on(
  processSnapshots.timestamp
)
