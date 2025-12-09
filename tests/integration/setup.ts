import { afterAll, afterEach, beforeEach, vi } from 'vitest'
import { unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../src/main/infrastructure/db/schema'

let testDbPath: string | null = null
let testDb: BetterSQLite3Database<typeof schema> | null = null

export function getTestDatabase(): BetterSQLite3Database<typeof schema> {
  if (testDb) return testDb

  testDbPath = join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`)
  const sqlite = new Database(testDbPath)
  sqlite.pragma('journal_mode = WAL')
  testDb = drizzle(sqlite, { schema })
  return testDb
}

export function cleanupTestDatabase(): void {
  if (testDb) {
    ;(testDb as unknown as { client: Database }).client.close()
    testDb = null
  }
  if (testDbPath && existsSync(testDbPath)) {
    try {
      unlinkSync(testDbPath)
    } catch {
      // cleanup errors
    }
    testDbPath = null
  }
}

beforeEach(() => cleanupTestDatabase())
afterEach(() => {
  cleanupTestDatabase()
  vi.clearAllMocks()
})
afterAll(() => cleanupTestDatabase())
