import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { RegistryRepository } from '../../../src/main/core/network/db-writer'
import { createTestDatabase, closeDatabase, getMigrationsPath } from '../helpers/test-database'
import * as schema from '../../../src/main/infrastructure/db/schema'
import type {
  GlobalRegistry,
  ApplicationRegistry,
  ProcessRegistry
} from '../../../src/main/shared/interfaces/common'

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
        // cleanup errors
      }
    }
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

  describe('Error Handling', () => {
    it('handles concurrent write operations without data corruption', async () => {
      const repo1 = new RegistryRepository(db)
      const repo2 = new RegistryRepository(db)

      const globalReg1 = new Map<string, GlobalRegistry>()
      globalReg1.set('interface1', {
        interfaceName: 'interface1',
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

      const globalReg2 = new Map<string, GlobalRegistry>()
      globalReg2.set('interface2', {
        interfaceName: 'interface2',
        totalPackets: 200,
        totalBytesSent: 10000,
        totalBytesReceived: 6000,
        ipv4Packets: 160,
        ipv6Packets: 40,
        tcpPackets: 120,
        udpPackets: 80,
        ipv4Percent: 80,
        ipv6Percent: 20,
        tcpPercent: 60,
        udpPercent: 40,
        inboundBytes: 6000,
        outboundBytes: 10000,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      })

      await Promise.all([
        repo1.writeRegistries(globalReg1, new Map(), new Map()),
        repo2.writeRegistries(globalReg2, new Map(), new Map())
      ])

      const results = await db.select().from(schema.globalSnapshots)
      expect(results.length).toBeGreaterThanOrEqual(2)

      const interfaceNames = results.map((r) => r.interfaceName)
      expect(interfaceNames).toContain('interface1')
      expect(interfaceNames).toContain('interface2')

      const iface1 = results.find((r) => r.interfaceName === 'interface1')
      const iface2 = results.find((r) => r.interfaceName === 'interface2')
      expect(iface1?.totalPackets).toBe(100)
      expect(iface2?.totalPackets).toBe(200)

      await repo1.close()
      await repo2.close()
    })

    it('handles large datasets (1000+ entries) efficiently', async () => {
      const repo = new RegistryRepository(db)
      const globalReg = new Map<string, GlobalRegistry>()

      const datasetSize = 1000
      for (let i = 0; i < datasetSize; i++) {
        globalReg.set(`interface-${i}`, {
          interfaceName: `interface-${i}`,
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
      }

      const startTime = Date.now()
      await repo.writeRegistries(globalReg, new Map(), new Map())
      const duration = Date.now() - startTime

      const results = await db.select().from(schema.globalSnapshots)
      expect(results.length).toBe(datasetSize)

      expect(results[0]?.interfaceName).toBe('interface-0')
      expect(results[datasetSize - 1]?.interfaceName).toBe(`interface-${datasetSize - 1}`)

      expect(duration).toBeLessThan(5000)

      await repo.close()
    })
  })

  describe('Data Querying', () => {
    it('queries snapshots by interface name', async () => {
      const repo = new RegistryRepository(db)
      const globalReg = new Map<string, GlobalRegistry>()

      globalReg.set('eth0', {
        interfaceName: 'eth0',
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

      const results = await db
        .select()
        .from(schema.globalSnapshots)
        .where((snapshots) => snapshots.interfaceName === 'eth0')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0]?.interfaceName).toBe('eth0')

      await repo.close()
    })

    it('queries snapshots with date range filtering', async () => {
      const repo = new RegistryRepository(db)
      const globalReg = new Map<string, GlobalRegistry>()

      const now = Date.now()
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000
      const oneDayAgo = now - 24 * 60 * 60 * 1000

      globalReg.set('eth0-old', {
        interfaceName: 'eth0-old',
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
        firstSeen: twoDaysAgo,
        lastSeen: twoDaysAgo
      })

      globalReg.set('eth0-recent', {
        interfaceName: 'eth0-recent',
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
        firstSeen: now,
        lastSeen: now
      })

      await repo.writeRegistries(globalReg, new Map(), new Map())

      const allResults = await db.select().from(schema.globalSnapshots)
      const results = allResults.filter((r) => {
        const lastSeen = r.lastSeen instanceof Date ? r.lastSeen.getTime() : Number(r.lastSeen)
        return lastSeen >= oneDayAgo
      })

      expect(results.length).toBe(1)
      expect(results[0]?.interfaceName).toBe('eth0-recent')

      await repo.close()
    })
  })
})
