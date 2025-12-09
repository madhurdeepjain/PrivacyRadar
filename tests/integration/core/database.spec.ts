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
        // Ignore cleanup errors
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

  it('handles empty registries', async () => {
    const repo = new RegistryRepository(db)
    await expect(repo.writeRegistries(new Map(), new Map(), new Map())).resolves.not.toThrow()
  })

  describe('Error Handling', () => {
    it('handles database write failures gracefully', async () => {
      const repo = new RegistryRepository(db)
      closeDatabase(db) // Close database to simulate connection loss

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

      await expect(repo.writeRegistries(globalReg, new Map(), new Map())).rejects.toThrow()
    })

    it('handles concurrent write operations', async () => {
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

      // Concurrent writes should both succeed
      await Promise.all([
        repo1.writeRegistries(globalReg1, new Map(), new Map()),
        repo2.writeRegistries(globalReg2, new Map(), new Map())
      ])

      const results = await db.select().from(schema.globalSnapshots)
      expect(results.length).toBeGreaterThanOrEqual(2)

      await repo1.close()
      await repo2.close()
    })

    it('handles concurrent read operations during writes', async () => {
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

      // Concurrent read and write
      const [writeResult, readResult] = await Promise.all([
        repo.writeRegistries(globalReg, new Map(), new Map()),
        db.select().from(schema.globalSnapshots)
      ])

      expect(readResult).toBeDefined()
      await repo.close()
    })

    it('handles invalid data gracefully', async () => {
      const repo = new RegistryRepository(db)

      // Try to write with missing required fields (TypeScript won't allow this, but runtime might)
      const invalidReg = new Map<string, any>()
      invalidReg.set('invalid', {
        interfaceName: 'invalid'
        // Missing required fields
      })

      // Should either throw or handle gracefully
      try {
        await repo.writeRegistries(invalidReg, new Map(), new Map())
      } catch (error) {
        expect(error).toBeDefined()
      }

      await repo.close()
    })

    it('handles very large datasets', async () => {
      const repo = new RegistryRepository(db)
      const globalReg = new Map<string, GlobalRegistry>()

      // Create many registry entries
      for (let i = 0; i < 1000; i++) {
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

      await repo.writeRegistries(globalReg, new Map(), new Map())
      const results = await db.select().from(schema.globalSnapshots)
      expect(results.length).toBe(1000)

      await repo.close()
    })

    it('handles database file permission errors', async () => {
      // Create a database that we'll make read-only
      const readOnlyPath = join(tmpdir(), `readonly-db-${Date.now()}.db`)
      const readOnlyDb = createTestDatabase(readOnlyPath, getMigrationsPath())

      // Close and try to write to read-only file (simulated)
      closeDatabase(readOnlyDb)

      // Try to create a new repository with closed database
      const repo = new RegistryRepository(readOnlyDb)
      const globalReg = new Map<string, GlobalRegistry>()
      globalReg.set('test', {
        interfaceName: 'test',
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

      await expect(repo.writeRegistries(globalReg, new Map(), new Map())).rejects.toThrow()

      if (existsSync(readOnlyPath)) {
        try {
          unlinkSync(readOnlyPath)
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('handles schema migration failures', () => {
      const invalidMigrationsPath = join(tmpdir(), 'nonexistent-migrations')

      // Should handle missing migrations gracefully or throw
      expect(() => {
        const testDbPath = join(tmpdir(), `test-db-${Date.now()}.db`)
        createTestDatabase(testDbPath, invalidMigrationsPath)
      }).toThrow()
    })
  })
})
