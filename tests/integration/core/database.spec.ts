import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { RegistryRepository } from '../../../src/main/core/network/db-writer'
import { createTestDatabase, closeDatabase, getMigrationsPath } from '../helpers/test-database'
import * as schema from '../../../src/main/infrastructure/db/schema'
import type { GlobalRegistry, ApplicationRegistry, ProcessRegistry } from '../../../src/main/shared/interfaces/common'

vi.mock('@infra/logging', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('@shared/utils/environment', () => ({
  isDevelopment: vi.fn(() => false)
}))

describe('Database Operations Integration', () => {
  let dbPath: string
  let db: ReturnType<typeof createTestDatabase>

  beforeEach(() => {
    const testDir = tmpdir()
    dbPath = join(testDir, `test-db-${Date.now()}.db`)
    const migrationsPath = getMigrationsPath()
    db = createTestDatabase(dbPath, migrationsPath)
  })

  afterEach(() => {
    if (db) {
      closeDatabase(db)
    }
    if (dbPath && existsSync(dbPath)) {
      try {
        unlinkSync(dbPath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  it('initializes database with schema', () => {
    expect(db).toBeDefined()
  })

  it('writes global registry snapshots', async () => {
    const repo = new RegistryRepository(db)
    const globalReg = new Map<string, GlobalRegistry>()
    globalReg.set('test-interface', {
      interfaceName: 'test-interface',
      totalPackets: 100,
      totalBytesSent: 5000,
      totalBytesReceived: 3000,
      ipv4Packets: 80,
      ipv6Packets: 20,
      tcpPackets: 60,
      udpPackets: 40,
      ipv4Percent: 80,
      ipv6Percent: 20,
      tcpPercent: 60,
      udpPercent: 40,
      inboundBytes: 3000,
      outboundBytes: 5000,
      firstSeen: Date.now(),
      lastSeen: Date.now()
    })
    await repo.writeRegistries(globalReg, new Map(), new Map())
    const results = await db.select().from(schema.globalSnapshots)
    expect(results[0]?.interfaceName).toBe('test-interface')
  })

  it('writes application registry snapshots', async () => {
    const repo = new RegistryRepository(db)
    const appRegs = new Map<string, ApplicationRegistry>()
    appRegs.set('test-app', {
      appName: 'test-app',
      appDisplayName: 'VS Code',
      totalPackets: 50,
      totalBytesSent: 2500,
      totalBytesReceived: 1500,
      ipv4Packets: 40,
      ipv6Packets: 10,
      tcpPackets: 30,
      udpPackets: 20,
      ipv4Percent: 80,
      ipv6Percent: 20,
      tcpPercent: 60,
      udpPercent: 40,
      inboundBytes: 1500,
      outboundBytes: 2500,
      processCount: 1,
      processRegistryIDs: ['proc-1'],
      uniqueRemoteIPs: new Set(['8.8.8.8']),
      uniqueDomains: new Set(),
      geoLocations: {},
      interfaceStats: new Map(),
      firstSeen: Date.now(),
      lastSeen: Date.now()
    })
    await repo.writeRegistries(new Map(), appRegs, new Map())
    const results = await db.select().from(schema.applicationSnapshots)
    expect(results[0]?.appName).toBe('test-app')
  })

  it('writes process registry snapshots', async () => {
    const repo = new RegistryRepository(db)
    const procRegs = new Map<string, ProcessRegistry>()
    procRegs.set('proc-1', {
      id: 'proc-1',
      appName: 'test-app',
      pid: 1234,
      parentPID: 1,
      procName: 'test-process',
      exePath: '/usr/bin/test',
      isRootProcess: false,
      totalPackets: 25,
      totalBytesSent: 1250,
      totalBytesReceived: 750,
      ipv4Packets: 20,
      ipv6Packets: 5,
      tcpPackets: 15,
      udpPackets: 10,
      ipv4Percent: 80,
      ipv6Percent: 20,
      tcpPercent: 60,
      udpPercent: 40,
      inboundBytes: 750,
      outboundBytes: 1250,
      uniqueRemoteIPs: new Set(['8.8.8.8']),
      geoLocations: {},
      interfaceStats: new Map(),
      firstSeen: Date.now(),
      lastSeen: Date.now()
    })
    await repo.writeRegistries(new Map(), new Map(), procRegs)
    const results = await db.select().from(schema.processSnapshots)
    expect(results[0]?.pid).toBe(1234)
  })

  it('handles empty registries', async () => {
    const repo = new RegistryRepository(db)
    await expect(repo.writeRegistries(new Map(), new Map(), new Map())).resolves.not.toThrow()
  })

  it('closes repository properly', async () => {
    const repo = new RegistryRepository(db)
    await expect(repo.close()).resolves.not.toThrow()
  })
})

