import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { getDatabase } from '@infra/db'
import * as schema from '@infra/db/schema'

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/test/app/path')
  }
}))

vi.mock('cap', () => ({
  default: {}
}))

vi.mock('@infra/db', () => ({
  getDatabase: vi.fn()
}))

vi.mock('@infra/logging', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@config/constants', () => ({
  DEV_DATA_PATH: '/test/dev-data',
  PROC_CON_SNAPSHOT_INTERVAL_MS: 5000,
  REGISTRY_SNAPSHOT_INTERVAL_MS: 10000
}))

let queryDatabase: (options: {
  table: 'global_snapshots' | 'application_snapshots' | 'process_snapshots'
  limit?: number
  offset?: number
}) => [unknown[], string]

beforeAll(async () => {
  const module = await import('@app/analyzer-runner')
  queryDatabase = module.queryDatabase
})

describe('queryDatabase Security Tests', () => {
  const createMockQueryBuilder = (
    results: unknown[] = []
  ): {
    limit: ReturnType<typeof vi.fn>
    offset: ReturnType<typeof vi.fn>
    all: ReturnType<typeof vi.fn>
  } => {
    const queryBuilder = {
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      all: vi.fn().mockReturnValue(results)
    }
    return queryBuilder
  }

  const createMockDb = (
    results: unknown[] = []
  ): {
    select: ReturnType<typeof vi.fn>
  } => {
    const queryBuilder = createMockQueryBuilder(results)
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue(queryBuilder)
      })
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Input Validation', () => {
    it('rejects non-object input', () => {
      // @ts-expect-error Testing invalid input
      const [results, error] = queryDatabase(null)
      expect(results).toEqual([])
      expect(error).toContain('Invalid query options: must be an object')
    })

    it('rejects missing table', () => {
      // @ts-expect-error Testing invalid input
      const [results, error] = queryDatabase({})
      expect(results).toEqual([])
      expect(error).toContain('Invalid table')
    })

    it('rejects invalid table name', () => {
      const [results, error] = queryDatabase({
        // @ts-expect-error Testing invalid input
        table: 'sqlite_master'
      })
      expect(results).toEqual([])
      expect(error).toContain('not accessible')
    })

    it('rejects restricted table names', () => {
      const restrictedTables = ['settings', 'sqlite_master', 'sqlite_sequence', 'malicious_table']
      restrictedTables.forEach((table) => {
        const [results, error] = queryDatabase({
          // @ts-expect-error Testing invalid input
          table
        })
        expect(results).toEqual([])
        expect(error).toContain('not accessible')
      })
    })

    it('rejects limit below minimum', () => {
      const [results, error] = queryDatabase({
        table: 'global_snapshots',
        limit: 0
      })
      expect(results).toEqual([])
      expect(error).toContain('Limit must be between 1 and 10000')
    })

    it('rejects limit above maximum', () => {
      const [results, error] = queryDatabase({
        table: 'global_snapshots',
        limit: 10001
      })
      expect(results).toEqual([])
      expect(error).toContain('Limit must be between 1 and 10000')
    })

    it('rejects negative offset', () => {
      const [results, error] = queryDatabase({
        table: 'global_snapshots',
        offset: -1
      })
      expect(results).toEqual([])
      expect(error).toContain('Offset must be non-negative')
    })

    it('accepts valid options with defaults', () => {
      const mockDb = createMockDb([{ id: 1, interfaceName: 'eth0' }])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      const [results, error] = queryDatabase({
        table: 'global_snapshots'
      })
      expect(error).toBe('')
      expect(results).toHaveLength(1)
      expect(mockDb.select).toHaveBeenCalled()
    })
  })

  describe('Table Access Control', () => {
    it.each([
      ['global_snapshots', schema.globalSnapshots],
      ['application_snapshots', schema.applicationSnapshots],
      ['process_snapshots', schema.processSnapshots]
    ])('allows queries on whitelisted table: %s', (table, tableSchema) => {
      const mockResults = [{ id: 1, totalPackets: 100 }]
      const mockDb = createMockDb(mockResults)
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      const [results, error] = queryDatabase({
        table: table as 'global_snapshots' | 'application_snapshots' | 'process_snapshots',
        limit: 10,
        offset: 0
      })

      expect(error).toBe('')
      expect(results).toEqual(mockResults)
      expect(mockDb.select).toHaveBeenCalled()
      const fromCall = mockDb.select().from
      expect(fromCall).toHaveBeenCalledWith(tableSchema)
    })

    it('uses correct table schema for each table type', () => {
      const mockDb = createMockDb([])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      queryDatabase({ table: 'global_snapshots' })
      expect(mockDb.select().from).toHaveBeenCalledWith(schema.globalSnapshots)

      vi.clearAllMocks()
      queryDatabase({ table: 'application_snapshots' })
      expect(mockDb.select().from).toHaveBeenCalledWith(schema.applicationSnapshots)

      vi.clearAllMocks()
      queryDatabase({ table: 'process_snapshots' })
      expect(mockDb.select().from).toHaveBeenCalledWith(schema.processSnapshots)
    })
  })

  describe('Limit and Offset', () => {
    it('applies limit correctly', () => {
      const mockDb = createMockDb([])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      queryDatabase({
        table: 'global_snapshots',
        limit: 500
      })

      const queryBuilder = mockDb.select().from(schema.globalSnapshots)
      expect(queryBuilder.limit).toHaveBeenCalledWith(500)
    })

    it('applies default limit of 1000', () => {
      const mockDb = createMockDb([])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      queryDatabase({
        table: 'global_snapshots'
      })

      const queryBuilder = mockDb.select().from(schema.globalSnapshots)
      expect(queryBuilder.limit).toHaveBeenCalledWith(1000)
    })

    it('applies offset correctly', () => {
      const mockDb = createMockDb([])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      queryDatabase({
        table: 'global_snapshots',
        offset: 100
      })

      const queryBuilder = mockDb.select().from(schema.globalSnapshots)
      expect(queryBuilder.offset).toHaveBeenCalledWith(100)
    })

    it('applies default offset of 0', () => {
      const mockDb = createMockDb([])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      queryDatabase({
        table: 'global_snapshots'
      })

      const queryBuilder = mockDb.select().from(schema.globalSnapshots)
      expect(queryBuilder.offset).toHaveBeenCalledWith(0)
    })

    it('applies both limit and offset together', () => {
      const mockDb = createMockDb([])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      queryDatabase({
        table: 'global_snapshots',
        limit: 50,
        offset: 25
      })

      const queryBuilder = mockDb.select().from(schema.globalSnapshots)
      expect(queryBuilder.limit).toHaveBeenCalledWith(50)
      expect(queryBuilder.offset).toHaveBeenCalledWith(25)
    })
  })

  describe('Query Execution', () => {
    it('executes query and returns results', () => {
      const mockResults = [
        { id: 1, interfaceName: 'eth0', totalPackets: 100 },
        { id: 2, interfaceName: 'wlan0', totalPackets: 200 }
      ]
      const mockDb = createMockDb(mockResults)
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      const [results, error] = queryDatabase({
        table: 'global_snapshots',
        limit: 10
      })

      expect(error).toBe('')
      expect(results).toEqual(mockResults)
      const queryBuilder = mockDb.select().from(schema.globalSnapshots)
      expect(queryBuilder.all).toHaveBeenCalled()
    })

    it('handles empty results', () => {
      const mockDb = createMockDb([])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      const [results, error] = queryDatabase({
        table: 'application_snapshots'
      })

      expect(error).toBe('')
      expect(results).toEqual([])
    })

    it('handles query errors gracefully', () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnThis(),
            offset: vi.fn().mockReturnThis(),
            all: vi.fn().mockImplementation(() => {
              throw new Error('Database connection failed')
            })
          })
        })
      }
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      const [results, error] = queryDatabase({
        table: 'process_snapshots'
      })

      expect(results).toEqual([])
      expect(error).toContain('Database connection failed')
    })
  })

  describe('Security: No SQL Injection', () => {
    it('does not accept SQL strings - only table names', () => {
      const [results, error] = queryDatabase({
        // @ts-expect-error Testing invalid input
        table: "global_snapshots'; DROP TABLE settings; --"
      })
      expect(results).toEqual([])
      expect(error).toContain('not accessible')
    })

    it('validates table name strictly', () => {
      const maliciousInputs = [
        "global_snapshots'; DROP TABLE settings; --",
        'global_snapshots UNION SELECT * FROM settings',
        'global_snapshots; DELETE FROM settings'
      ]

      maliciousInputs.forEach((malicious) => {
        const [results, error] = queryDatabase({
          // @ts-expect-error Testing invalid input
          table: malicious
        })
        expect(results).toEqual([])
        expect(error).toContain('not accessible')
      })
    })

    it('uses Drizzle ORM (no raw SQL)', () => {
      const mockDb = createMockDb([])
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      queryDatabase({
        table: 'global_snapshots'
      })

      expect(mockDb.select).toHaveBeenCalled()
      expect(mockDb.select().from).toHaveBeenCalledWith(schema.globalSnapshots)
      expect(mockDb.select().from(schema.globalSnapshots).all).toHaveBeenCalled()
    })
  })
})
