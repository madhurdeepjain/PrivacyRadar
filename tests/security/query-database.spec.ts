import { describe, it, expect, vi } from 'vitest'
import { queryDatabase } from '../../src/main/app/analyzer-runner'
import { getDatabase } from '@infra/db'

vi.mock('@infra/db', () => ({
  getDatabase: vi.fn()
}))

describe('queryDatabase Security Tests', () => {
  const mockDb = {
    client: {
      prepare: vi.fn((sql: string) => ({
        iterate: vi.fn(() => [])
      }))
    }
  }

  beforeEach(() => {
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
      const [results, error] = queryDatabase('SELECT * FROM global_snapshots UNION SELECT * FROM settings')
      expect(results).toEqual([])
      expect(error).toContain('Dangerous SQL keywords')
    })

    it('blocks DROP statements even in SELECT context', () => {
      const [results, error] = queryDatabase('SELECT * FROM global_snapshots; DROP TABLE settings')
      expect(results).toEqual([])
      expect(error).toContain('Dangerous SQL keywords')
    })

    it('blocks comments', () => {
      const [results, error] = queryDatabase('SELECT * FROM global_snapshots -- DROP TABLE')
      expect(results).toEqual([])
      expect(error).toContain('SQL comments')
    })

    it('blocks multi-statement attacks', () => {
      const [results, error] = queryDatabase('SELECT * FROM global_snapshots; SELECT * FROM settings')
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
      const [results, error] = queryDatabase('SELECT * FROM global_snapshots WHERE invalid_column = 1')
      expect(results).toEqual([])
      expect(error).toContain('SQL syntax error')
    })
  })

  describe('Valid Queries', () => {
    it('executes valid SELECT with WHERE clause', () => {
      mockDb.client.prepare.mockReturnValue({
        iterate: () => [{ id: 1 }]
      })
      const [results, error] = queryDatabase('SELECT * FROM global_snapshots WHERE totalPackets > 100')
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
})

