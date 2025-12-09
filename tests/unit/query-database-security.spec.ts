import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { getDatabase } from '@infra/db'

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

// Import after mocks
let queryDatabase: (sql: string) => [unknown[], string]

beforeAll(async () => {
  const module = await import('../../src/main/app/analyzer-runner')
  queryDatabase = module.queryDatabase
})

describe('queryDatabase Security Tests', () => {
  const mockDb = {
    client: {
      prepare: vi.fn(() => ({
        iterate: vi.fn(() => [])
      }))
    }
  }

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('SQL Injection Prevention', () => {
    it('rejects non-SELECT queries', () => {
      const [results, error] = queryDatabase('DROP TABLE settings')
      expect(results).toEqual([])
      expect(error).toContain('Only SELECT queries are allowed')
      expect(mockDb.client.prepare).not.toHaveBeenCalled()
    })

    it('rejects INSERT queries', () => {
      const [results, error] = queryDatabase('INSERT INTO settings VALUES (1, "test")')
      expect(results).toEqual([])
      expect(error).toContain('Only SELECT queries are allowed')
    })

    it('rejects UPDATE queries', () => {
      const [results, error] = queryDatabase('UPDATE settings SET value = "hacked"')
      expect(results).toEqual([])
      expect(error).toContain('Only SELECT queries are allowed')
    })

    it('rejects DELETE queries', () => {
      const [results, error] = queryDatabase('DELETE FROM settings')
      expect(results).toEqual([])
      expect(error).toContain('Only SELECT queries are allowed')
    })

    it('blocks UNION attacks', () => {
      const [results, error] = queryDatabase(
        'SELECT * FROM global_snapshots UNION SELECT * FROM settings'
      )
      expect(results).toEqual([])
      expect(error).toContain('Dangerous SQL keywords')
    })

    it('blocks DROP statements even in SELECT context', () => {
      const [results, error] = queryDatabase('SELECT * FROM global_snapshots; DROP TABLE settings')
      expect(results).toEqual([])
      expect(error).toContain('Dangerous SQL keywords')
    })

    it('blocks comments', () => {
      // Use a query that won't match dangerous keywords but has a comment
      const [results, error] = queryDatabase('SELECT id FROM global_snapshots -- malicious comment')
      expect(results).toEqual([])
      expect(error).toContain('SQL comments')
    })

    it('blocks multi-statement attacks', () => {
      const [results, error] = queryDatabase(
        'SELECT * FROM global_snapshots; SELECT * FROM settings'
      )
      expect(results).toEqual([])
      expect(error).toContain('multiple statements')
    })
  })

  describe('Table Access Control', () => {
    it('rejects queries on sqlite_master', () => {
      const [results, error] = queryDatabase('SELECT * FROM sqlite_master')
      expect(results).toEqual([])
      expect(error).toContain('not accessible')
    })

    it('rejects queries on settings table', () => {
      const [results, error] = queryDatabase('SELECT * FROM settings')
      expect(results).toEqual([])
      expect(error).toContain('not accessible')
    })

    it('allows queries on global_snapshots', () => {
      mockDb.client.prepare.mockReturnValue({
        iterate: () => [{ id: 1, interfaceName: 'eth0' }]
      })
      const [results, error] = queryDatabase('SELECT * FROM global_snapshots LIMIT 10')
      expect(error).toBe('')
      expect(Array.isArray(results)).toBe(true)
      expect(mockDb.client.prepare).toHaveBeenCalled()
    })

    it('allows queries on application_snapshots', () => {
      mockDb.client.prepare.mockReturnValue({
        iterate: () => []
      })
      const [results, error] = queryDatabase('SELECT appName FROM application_snapshots')
      expect(error).toBe('')
      expect(Array.isArray(results)).toBe(true)
    })

    it('allows queries on process_snapshots', () => {
      mockDb.client.prepare.mockReturnValue({
        iterate: () => []
      })
      const [results, error] = queryDatabase('SELECT pid FROM process_snapshots WHERE pid > 1000')
      expect(error).toBe('')
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('Input Validation', () => {
    it('rejects empty strings', () => {
      const [results, error] = queryDatabase('')
      expect(results).toEqual([])
      expect(error).toContain('non-empty string')
    })

    it('rejects non-string input', () => {
      // @ts-expect-error Testing invalid input
      const [results, error] = queryDatabase(null)
      expect(results).toEqual([])
      expect(error).toContain('non-empty string')
    })

    it('rejects queries without FROM clause', () => {
      const [results, error] = queryDatabase('SELECT 1')
      expect(results).toEqual([])
      expect(error).toContain('FROM clause required')
    })

    it('handles query errors gracefully', () => {
      mockDb.client.prepare.mockImplementation(() => {
        throw new Error('SQL syntax error')
      })
      const [results, error] = queryDatabase(
        'SELECT * FROM global_snapshots WHERE invalid_column = 1'
      )
      expect(results).toEqual([])
      expect(error).toContain('SQL syntax error')
    })
  })

  describe('Valid Queries', () => {
    it('executes valid SELECT with WHERE clause', () => {
      mockDb.client.prepare.mockReturnValue({
        iterate: () => [{ id: 1 }]
      })
      const [results, error] = queryDatabase(
        'SELECT * FROM global_snapshots WHERE totalPackets > 100'
      )
      expect(error).toBe('')
      expect(results).toHaveLength(1)
    })

    it('executes valid SELECT with LIMIT', () => {
      mockDb.client.prepare.mockReturnValue({
        iterate: () => []
      })
      const [results, error] = queryDatabase('SELECT * FROM application_snapshots LIMIT 10')
      expect(error).toBe('')
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('Concurrent Queries', () => {
    it('handles concurrent queries safely', async () => {
      mockDb.client.prepare.mockReturnValue({
        iterate: () => [{ id: 1 }]
      })

      const queries = Array.from({ length: 10 }, () =>
        queryDatabase('SELECT * FROM global_snapshots LIMIT 1')
      )

      const results = await Promise.all(queries)
      expect(results).toHaveLength(10)
      results.forEach(([data, error]) => {
        expect(error).toBe('')
        expect(Array.isArray(data)).toBe(true)
      })
    })
  })

  describe('Edge Cases', () => {
    it('handles whitespace-only string', () => {
      const [results, error] = queryDatabase('   \n\t  ')
      expect(results).toEqual([])
      // After trim, empty string is rejected as non-SELECT
      expect(error).toBeTruthy()
    })

    it('handles query with special unicode characters', () => {
      const [results] = queryDatabase('SELECT * FROM global_snapshots WHERE id = "测试"')
      // Should either succeed or fail validation, not crash
      expect(Array.isArray(results)).toBe(true)
    })

    it('handles query with null bytes', () => {
      const queryWithNull = 'SELECT * FROM global_snapshots\0 WHERE id = 1'
      const [results] = queryDatabase(queryWithNull)
      // Should handle gracefully
      expect(Array.isArray(results)).toBe(true)
    })

    it('handles query results with null values', () => {
      mockDb.client.prepare.mockReturnValue({
        iterate: () => [{ id: 1, name: null, value: undefined }]
      })

      const [results, error] = queryDatabase('SELECT * FROM global_snapshots')
      expect(error).toBe('')
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(1)
    })
  })

  describe('Encoded Payload Attacks', () => {
    it('rejects URL-encoded SQL injection attempts', () => {
      const encoded = 'SELECT%20*%20FROM%20settings%3B%20DROP%20TABLE%20settings'
      const decoded = decodeURIComponent(encoded)
      const [results, error] = queryDatabase(decoded)
      expect(results).toEqual([])
      expect(error).toContain('Dangerous SQL keywords')
    })

    it('rejects double-encoded payloads', () => {
      const doubleEncoded = encodeURIComponent(encodeURIComponent('DROP TABLE settings'))
      const decoded = decodeURIComponent(decodeURIComponent(doubleEncoded))
      const [results, error] = queryDatabase(`SELECT * FROM global_snapshots; ${decoded}`)
      expect(results).toEqual([])
      expect(error).toContain('Dangerous SQL keywords')
    })

    it('rejects comment-based obfuscation', () => {
      const withComments = 'SELECT/*comment*/ * FROM global_snapshots'
      const [results, error] = queryDatabase(withComments)
      expect(results).toEqual([])
      expect(error).toContain('SQL comments')
    })
  })
})
