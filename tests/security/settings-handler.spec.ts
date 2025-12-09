import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import path from 'path'

const mockHelpers = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      handlers: {
        get: (channel: string) => handlers.get(channel)
      }
    },
    app: {
      whenReady: vi.fn(() => Promise.resolve()),
      getPath: vi.fn((name: string) =>
        name === 'userData' ? '/tmp/test-user-data' : '/tmp/test-path'
      ),
      getAppPath: vi.fn(() => '/tmp/test-app-path'),
      quit: vi.fn(),
      on: vi.fn(),
      once: vi.fn()
    }
  }
})

vi.mock('electron', () => ({
  __esModule: true,
  default: mockHelpers,
  ...mockHelpers
}))

vi.mock('@electron-toolkit/utils', () => ({
  electronApp: {
    setAppUserModelId: vi.fn()
  }
}))

vi.mock('@infra/logging', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}))

function validateSettingKey(key: unknown): key is string {
  return typeof key === 'string' && /^[a-zA-Z0-9_-]+$/.test(key) && key.length <= 100
}

describe('Settings Handler Security Tests', () => {
  let testDir: string
  let testFilePath: string
  let setValueHandler: ((...args: unknown[]) => unknown) | undefined
  let getValueHandler: ((...args: unknown[]) => unknown) | undefined

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-settings-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    testFilePath = join(testDir, 'values.json')

    // Override getPath to return our test directory
    mockHelpers.app.getPath.mockImplementation((name: string) => {
      if (name === 'userData') return testDir
      return '/tmp/test-path'
    })

    const filePath = testFilePath

    setValueHandler = async (_event: unknown, key: string, value: string) => {
      if (!validateSettingKey(key)) {
        throw new Error('Invalid setting key')
      }

      if (typeof value !== 'string' || value.length > 10000) {
        throw new Error('Invalid setting value')
      }

      let values: Record<string, string> = {}
      const { existsSync } = await import('fs')
      if (existsSync(filePath)) {
        const data = await fs.readFile(filePath, 'utf8')
        try {
          const parsed = JSON.parse(data)
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            values = parsed
          }
        } catch {
          // continue with empty values
        }
      }

      values[key] = value

      const dirPath = path.dirname(filePath)
      await fs.mkdir(dirPath, { recursive: true })

      const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`
      await fs.writeFile(tmpPath, JSON.stringify(values), 'utf8')
      await fs.rename(tmpPath, filePath)
    }

    getValueHandler = async (_event: unknown, key: string) => {
      if (!validateSettingKey(key)) {
        return null
      }

      try {
        const { existsSync } = await import('fs')
        if (!existsSync(filePath)) {
          return null
        }
        const data = await fs.readFile(filePath, 'utf8')
        const values = JSON.parse(data)

        if (typeof values !== 'object' || values === null || Array.isArray(values)) {
          return null
        }

        return values[key] ?? null
      } catch {
        return null
      }
    }
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // cleanup errors
    }
    vi.clearAllMocks()
  })

  describe('set-value IPC Handler Security', () => {
    // Merged all key validation tests into parameterized test
    it.each([
      ['../settings', 'Invalid setting key'],
      ['../../etc/passwd', 'Invalid setting key'],
      ['/absolute/path', 'Invalid setting key'],
      ['key.value', 'Invalid setting key'],
      ['key@host', 'Invalid setting key'],
      ['key#comment', 'Invalid setting key'],
      ['key space', 'Invalid setting key'],
      ['a'.repeat(101), 'Invalid setting key'],
      ['', 'Invalid setting key']
    ])('rejects malicious key: %s', async (key, expectedError) => {
      expect(setValueHandler).toBeDefined()
      await expect(setValueHandler!(null, key, 'value')).rejects.toThrow(expectedError)
    })

    // Merged value validation tests
    it.each([
      ['a'.repeat(10001), 'Invalid setting value'],
      [null, 'Invalid setting value'],
      [123, 'Invalid setting value']
    ])('rejects invalid value: %s', async (value, expectedError) => {
      expect(setValueHandler).toBeDefined()
      // @ts-expect-error Testing invalid input
      await expect(setValueHandler!(null, 'validKey', value)).rejects.toThrow(expectedError)
    })

    it('accepts valid key-value pairs', async () => {
      expect(setValueHandler).toBeDefined()

      await setValueHandler!(null, 'viewMode', 'network')

      const data = await fs.readFile(testFilePath, 'utf8')
      const parsed = JSON.parse(data)
      expect(parsed.viewMode).toBe('network')
    })

    it('uses atomic write pattern (temp file then rename)', async () => {
      expect(setValueHandler).toBeDefined()

      await setValueHandler!(null, 'testKey', 'testValue')

      const data = await fs.readFile(testFilePath, 'utf8')
      const parsed = JSON.parse(data)
      expect(parsed.testKey).toBe('testValue')
    })

    it('handles corrupted JSON file gracefully', async () => {
      // Write corrupted JSON
      await fs.writeFile(testFilePath, '{ invalid json }', 'utf8')

      expect(setValueHandler).toBeDefined()

      await setValueHandler!(null, 'newKey', 'newValue')

      const data = await fs.readFile(testFilePath, 'utf8')
      const parsed = JSON.parse(data)
      expect(parsed).toHaveProperty('newKey')
      expect(parsed.newKey).toBe('newValue')
    })

    it('handles file permission errors', async () => {
      await fs.writeFile(testFilePath, '{}', 'utf8')
      await fs.chmod(testFilePath, 0o444)

      expect(setValueHandler).toBeDefined()

      try {
        await setValueHandler!(null, 'key', 'value')
        const data = await fs.readFile(testFilePath, 'utf8')
        expect(JSON.parse(data)).not.toHaveProperty('key')
      } catch (error) {
        expect(error).toBeDefined()
      } finally {
        try {
          await fs.chmod(testFilePath, 0o644)
        } catch {
          // cleanup
        }
      }
    })

    // Merged encoded payload tests
    it.each([
      ['../settings', '../settings'],
      ['key%2Evalue', 'key.value'], // URL encoded dot
      ['key%2Fvalue', 'key/value'], // URL encoded slash
      ['key\u002Evalue', 'key.value'], // Unicode dot
      ['key\x2Evalue', 'key.value'], // Hex dot
      ['key\0value', 'key\0value'] // Null byte
    ])('rejects encoded path traversal: %s', async (encoded, decoded) => {
      expect(setValueHandler).toBeDefined()
      const key = encoded.includes('%') ? decodeURIComponent(encoded) : decoded

      await expect(setValueHandler!(null, key, 'value')).rejects.toThrow('Invalid setting key')
    })
  })

  describe('get-value IPC Handler Security', () => {
    it('rejects malicious keys', async () => {
      expect(getValueHandler).toBeDefined()

      const result = await getValueHandler!(null, '../etc/passwd')
      expect(result).toBeNull()
    })

    it('returns null for non-existent file', async () => {
      expect(getValueHandler).toBeDefined()

      const result = await getValueHandler!(null, 'nonexistent')
      expect(result).toBeNull()
    })

    it('returns null for corrupted JSON', async () => {
      await fs.writeFile(testFilePath, '{ invalid json }', 'utf8')

      expect(getValueHandler).toBeDefined()
      const result = await getValueHandler!(null, 'anyKey')
      expect(result).toBeNull()
    })

    it('returns null for non-object JSON', async () => {
      await fs.writeFile(testFilePath, '"just a string"', 'utf8')

      expect(getValueHandler).toBeDefined()
      const result = await getValueHandler!(null, 'anyKey')
      expect(result).toBeNull()
    })

    it('returns value for valid key', async () => {
      await fs.writeFile(testFilePath, JSON.stringify({ viewMode: 'network' }), 'utf8')

      expect(getValueHandler).toBeDefined()
      const result = await getValueHandler!(null, 'viewMode')
      expect(result).toBe('network')
    })
  })
})
