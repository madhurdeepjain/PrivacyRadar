import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.fn()

const promisifyCustom = promisify.custom

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  default: {
    execFile: execFileMock
  }
}))

vi.mock('@infra/logging', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn()
  }
}))

const fixturesDir = resolve(process.cwd(), 'tests/fixtures/netstat')

type FixtureName = 'linux' | 'darwin' | 'windows'

type ExecFileCallback = (error: Error | null, stdout?: string, stderr?: string) => void

function loadFixture(name: FixtureName): string {
  return readFileSync(resolve(fixturesDir, `${name}.txt`), 'utf8')
}

function mockExecWithFixture(name: FixtureName): void {
  execFileMock.mockImplementation(
    (cmd: string, args: string[], options: unknown, callback: ExecFileCallback) => {
      const cb = (typeof options === 'function' ? options : callback) as ExecFileCallback
      cb(null, loadFixture(name), '')
      return undefined
    }
  )
}

;(execFileMock as unknown as Record<symbol, unknown>)[promisifyCustom] = (
  cmd: string,
  args: string[] = [],
  options?: unknown
) =>
  new Promise<{ stdout: string; stderr: string }>((resolvePromise, rejectPromise) => {
    execFileMock(
      cmd,
      args,
      options ?? {},
      (error: Error | null, stdout: string = '', stderr: string = '') => {
        if (error) {
          rejectPromise(error)
        } else {
          resolvePromise({ stdout, stderr })
        }
      }
    )
  })

describe('collectNetstatRows', () => {
  let collectNetstatRows: (typeof import('@main/core/network/netstat-runner'))['collectNetstatRows']
  const originalPlatform = process.platform as NodeJS.Platform

  const setPlatform = (value: NodeJS.Platform): void => {
    Object.defineProperty(process, 'platform', {
      value,
      configurable: true
    })
  }

  beforeAll(async () => {
    ;({ collectNetstatRows } = await import('@main/core/network/netstat-runner'))
  })

  afterEach(() => {
    execFileMock.mockReset()
    setPlatform(originalPlatform)
  })

  afterAll(() => {
    setPlatform(originalPlatform)
  })

  it('parses linux netstat output', async () => {
    setPlatform('linux')
    mockExecWithFixture('linux')

    const rows = await collectNetstatRows()

    expect(execFileMock).toHaveBeenCalledWith(
      'netstat',
      ['-apntu'],
      expect.objectContaining({
        encoding: 'utf8',
        timeout: expect.any(Number)
      }),
      expect.any(Function)
    )

    expect(rows.length).toBeGreaterThan(80)

    const listenerWithPid = rows.find(
      (row) =>
        row.protocol === 'TCP' && row.local?.address === '0.0.0.0' && row.local?.port === 55545
    )
    expect(listenerWithPid).toMatchObject({
      remote: { address: '0.0.0.0' },
      state: 'LISTEN',
      pid: 29686
    })

    const listenerWithoutPid = rows.find(
      (row) =>
        row.protocol === 'TCP' && row.local?.address === '0.0.0.0' && row.local?.port === 27500
    )
    expect(listenerWithoutPid?.pid).toBeUndefined()

    const udpSample = rows.find(
      (row) =>
        row.protocol === 'UDP' && row.local?.address === '0.0.0.0' && row.local?.port === 1900
    )
    expect(udpSample).toMatchObject({
      remote: { address: '0.0.0.0' },
      state: undefined,
      pid: 29686
    })
  })

  it('parses darwin netstat output', async () => {
    setPlatform('darwin')
    mockExecWithFixture('darwin')

    const rows = await collectNetstatRows()

    expect(execFileMock).toHaveBeenCalledWith(
      'netstat',
      ['-vanl'],
      expect.objectContaining({ encoding: 'utf8' }),
      expect.any(Function)
    )

    expect(rows.length).toBeGreaterThan(80)

    const tcp6Sample = rows.find(
      (row) =>
        row.protocol === 'TCP6' &&
        row.local?.address?.startsWith('fe80::19bd:f0ae:3d72:8812%utun5') &&
        row.local?.port === 1024
    )
    expect(tcp6Sample).toMatchObject({
      remote: expect.objectContaining({ port: 1024 }),
      state: 'SYN_SENT',
      pid: 855
    })

    const udp4Sample = rows.find(
      (row) =>
        row.protocol === 'UDP4' &&
        row.local?.address === '192.168.68.126' &&
        row.local?.port === 60067 &&
        row.remote?.address === '162.159.137.232'
    )
    expect(udp4Sample).toMatchObject({
      remote: { address: '162.159.137.232', port: 443 },
      pid: 39117
    })
  })

  it('parses windows netstat output', async () => {
    setPlatform('win32')
    mockExecWithFixture('windows')

    const rows = await collectNetstatRows()

    expect(execFileMock).toHaveBeenCalledWith(
      'netstat.exe',
      ['-ano'],
      expect.objectContaining({ encoding: 'utf8' }),
      expect.any(Function)
    )

    expect(rows.length).toBeGreaterThan(150)

    const establishedTcp = rows.find(
      (row) =>
        row.protocol === 'TCP' &&
        row.local?.address === '10.0.0.38' &&
        row.local?.port === 49458 &&
        row.remote?.address === '162.254.192.98'
    )
    expect(establishedTcp).toMatchObject({
      remote: { address: '162.254.192.98', port: 443 },
      state: 'ESTABLISHED',
      pid: 16568
    })

    const ipv6Tcp = rows.find(
      (row) =>
        row.protocol === 'TCP' &&
        row.local?.address === '2601:18a:8380:9d60:75ba:bb00:ab7f:5a51' &&
        row.local?.port === 51755
    )
    expect(ipv6Tcp).toMatchObject({
      remote: { address: '2603:1036:302:880::2', port: 443 },
      state: 'FIN_WAIT_1',
      pid: 11696
    })

    const udpRow = rows.find(
      (row) =>
        row.protocol === 'UDP' &&
        row.local?.address === '0.0.0.0' &&
        row.local?.port === 1900 &&
        row.pid === 2264
    )
    expect(udpRow?.state).toBeUndefined()
  })

  describe('Error Handling', () => {
    it('handles command execution failures', async () => {
      setPlatform('linux')
      const error = new Error('Command not found')
      execFileMock.mockImplementation(
        (cmd: string, args: string[], options: unknown, callback: ExecFileCallback) => {
          const cb = (typeof options === 'function' ? options : callback) as ExecFileCallback
          cb(error, undefined, 'netstat: command not found')
          return undefined
        }
      )

      await expect(collectNetstatRows()).rejects.toThrow('Command not found')
      expect(execFileMock).toHaveBeenCalled()
    })

    it('handles timeout errors', async () => {
      setPlatform('linux')
      const timeoutError = new Error('Command timed out')
      timeoutError.name = 'TimeoutError'
      execFileMock.mockImplementation(
        (cmd: string, args: string[], options: unknown, callback: ExecFileCallback) => {
          const cb = (typeof options === 'function' ? options : callback) as ExecFileCallback
          cb(timeoutError, undefined, '')
          return undefined
        }
      )

      await expect(collectNetstatRows()).rejects.toThrow('Command timed out')
    })

    it('handles empty output gracefully', async () => {
      setPlatform('linux')
      execFileMock.mockImplementation(
        (cmd: string, args: string[], options: unknown, callback: ExecFileCallback) => {
          const cb = (typeof options === 'function' ? options : callback) as ExecFileCallback
          cb(null, '', '')
          return undefined
        }
      )

      const rows = await collectNetstatRows()
      expect(rows).toEqual([])
    })

    it('handles invalid/malformed output gracefully', async () => {
      setPlatform('linux')
      execFileMock.mockImplementation(
        (cmd: string, args: string[], options: unknown, callback: ExecFileCallback) => {
          const cb = (typeof options === 'function' ? options : callback) as ExecFileCallback
          cb(null, 'This is not valid netstat output\nRandom garbage data\n', '')
          return undefined
        }
      )

      const rows = await collectNetstatRows()
      // Should return empty array or minimal valid rows, not crash
      expect(Array.isArray(rows)).toBe(true)
    })

    it('handles output with only headers', async () => {
      setPlatform('linux')
      execFileMock.mockImplementation(
        (cmd: string, args: string[], options: unknown, callback: ExecFileCallback) => {
          const cb = (typeof options === 'function' ? options : callback) as ExecFileCallback
          cb(null, 'Active Internet connections (w/o servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State\n', '')
          return undefined
        }
      )

      const rows = await collectNetstatRows()
      expect(Array.isArray(rows)).toBe(true)
      expect(rows.length).toBe(0)
    })

    it('handles stderr output without failing', async () => {
      setPlatform('linux')
      execFileMock.mockImplementation(
        (cmd: string, args: string[], options: unknown, callback: ExecFileCallback) => {
          const cb = (typeof options === 'function' ? options : callback) as ExecFileCallback
          cb(null, loadFixture('linux'), 'Some warning message')
          return undefined
        }
      )

      const rows = await collectNetstatRows()
      // Should still parse successfully despite stderr
      expect(rows.length).toBeGreaterThan(0)
    })


    it('handles unsupported platform gracefully', async () => {
      setPlatform('freebsd' as NodeJS.Platform)
      mockExecWithFixture('linux') // Fallback to linux command

      // Should not throw, but use fallback
      const rows = await collectNetstatRows()
      expect(Array.isArray(rows)).toBe(true)
    })

    it('respects custom timeout option', async () => {
      setPlatform('linux')
      mockExecWithFixture('linux')

      await collectNetstatRows({ timeoutMs: 1000 })

      expect(execFileMock).toHaveBeenCalledWith(
        'netstat',
        ['-apntu'],
        expect.objectContaining({
          timeout: 1000
        }),
        expect.any(Function)
      )
    })

    it('handles partial/corrupted output', async () => {
      setPlatform('linux')
      execFileMock.mockImplementation(
        (cmd: string, args: string[], options: unknown, callback: ExecFileCallback) => {
          const cb = (typeof options === 'function' ? options : callback) as ExecFileCallback
          cb(null, 'tcp        0      0 0.0.0.0:8080    0.0.0.0:*               LISTEN      \n' +
                   'incomplete line with missing data\n' +
                   'udp        0      0 0.0.0.0:53     0.0.0.0:*                           1234\n', '')
          return undefined
        }
      )

      const rows = await collectNetstatRows()
      // Should parse what it can, skip invalid lines
      expect(Array.isArray(rows)).toBe(true)
    })
  })
})
