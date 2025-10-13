import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '@infra/logging'

export type NetstatEndpoint = {
  address?: string | null
  port?: number
}

export type NetstatRow = {
  protocol?: string
  local?: NetstatEndpoint
  remote?: NetstatEndpoint
  state?: string
  pid?: number
}

type NetstatCommand = {
  cmd: string
  args: string[]
}

type NetstatOptions = {
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5000
const MAX_STDOUT_BUFFER = 10 * 1024 * 1024

const execFileAsync = promisify(execFile)

const NETSTAT_COMMANDS: Partial<Record<NodeJS.Platform, NetstatCommand>> = {
  linux: {
    cmd: 'netstat',
    args: ['-apntu']
  },
  darwin: {
    cmd: 'netstat',
    args: ['-vanl']
  },
  win32: {
    cmd: 'netstat.exe',
    args: ['-ano']
  }
}

export async function collectNetstatRows(options?: NetstatOptions): Promise<NetstatRow[]> {
  const platform = process.platform
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const command = NETSTAT_COMMANDS[platform] ?? NETSTAT_COMMANDS.linux

  if (!command) {
    throw new Error(`Unsupported platform for netstat: ${platform}`)
  }

  try {
    const { stdout, stderr } = await execFileAsync(command.cmd, command.args, {
      encoding: 'utf8',
      maxBuffer: MAX_STDOUT_BUFFER,
      windowsHide: true,
      timeout: timeoutMs
    })

    if (stderr?.trim()) {
      logger.debug('netstat stderr output', { stderr: stderr.trim() })
    }

    return parseNetstatOutput(stdout)
  } catch (error) {
    logger.error('Failed to execute netstat command', {
      command: `${command.cmd} ${command.args.join(' ')}`,
      error
    })
    throw error
  }
}

function parseNetstatOutput(output: string): NetstatRow[] {
  const rows: NetstatRow[] = []

  let headerLayout: HeaderLayout | null = null

  output.split(/\r?\n/).forEach((rawLine) => {
    if (!rawLine.trim()) return

    const layout = tryParseHeaderLayout(rawLine)
    if (layout) {
      headerLayout = layout
      return
    }

    const parsed = parseDataLine(rawLine, headerLayout)
    if (parsed) rows.push(parsed)
  })

  return rows
}

type HeaderColumnKey = 'protocol' | 'local' | 'remote' | 'state' | 'pid'

type HeaderLayout = {
  columns: Array<{ key: HeaderColumnKey; start: number }>
}

function tryParseHeaderLayout(line: string): HeaderLayout | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  if (!trimmed.includes('Proto') || !trimmed.includes('Local')) return null

  const protoPos = findColumnPosition(line, ['Proto'])
  const localPos = findColumnPosition(line, ['Local Address'])
  const remotePos = findColumnPosition(line, ['Foreign Address', 'Remote Address'])
  const statePos = findColumnPosition(line, ['(state)', 'State'])
  const pidPos = findColumnPosition(line, ['PID'])

  if (protoPos === undefined || localPos === undefined || remotePos === undefined) {
    return null
  }

  const columns: HeaderLayout['columns'] = [
    { key: 'protocol', start: protoPos },
    { key: 'local', start: localPos },
    { key: 'remote', start: remotePos }
  ]

  if (statePos !== undefined) columns.push({ key: 'state', start: statePos })
  if (pidPos !== undefined) columns.push({ key: 'pid', start: pidPos })

  columns.sort((a, b) => a.start - b.start)

  return { columns }
}

function findColumnPosition(line: string, labels: string[]): number | undefined {
  const lower = line.toLowerCase()
  for (const label of labels) {
    const idx = lower.indexOf(label.toLowerCase())
    if (idx !== -1) return idx
  }
  return undefined
}

function parseDataLine(line: string, headerLayout: HeaderLayout | null): NetstatRow | null {
  if (!headerLayout) return null

  const columns = extractColumns(line, headerLayout)

  const protocolToken = columns.protocol?.trim().split(/\s+/)[0]
  const protocol = protocolToken?.toUpperCase()
  if (!protocol || !/^(TCP|UDP)/.test(protocol)) return null

  const localRaw = columns.local
  const remoteRaw = columns.remote
  if (!localRaw || !remoteRaw) return null

  const stateRaw = columns.state
  const pidRaw = columns.pid

  const state = stateRaw?.replace(/[()]/g, '').trim() || undefined
  const pidColumn = pidRaw?.split(/ {2,}/)[0]
  const pid = parsePid(pidColumn)

  return {
    protocol,
    local: parseEndpoint(localRaw.trim()),
    remote: parseEndpoint(remoteRaw.trim()),
    state,
    pid
  }
}

function extractColumns(
  line: string,
  headerLayout: HeaderLayout
): Record<HeaderColumnKey, string | undefined> {
  const result: Partial<Record<HeaderColumnKey, string>> = {}
  const sorted = headerLayout.columns

  for (let i = 0; i < sorted.length; i += 1) {
    const { key, start } = sorted[i]
    result[key] = line.slice(start).split(' ')[0].split('/')[0]
  }

  return result as Record<HeaderColumnKey, string | undefined>
}

function parseEndpoint(raw: string | undefined): NetstatEndpoint | undefined {
  if (!raw) return undefined
  if (raw === '-' || raw === ':::' || raw === '::' || raw === '*') return { address: raw }

  if (raw === '*:*' || raw === '*.*') return { address: '*' }

  if (raw.startsWith('[') && raw.includes(']')) {
    const closing = raw.indexOf(']')
    const address = raw.slice(1, closing)
    const remainder = raw.slice(closing + 1)
    const match = remainder.match(/[.:](\d+)$/)
    if (match) {
      return { address, port: Number.parseInt(match[1], 10) }
    }
    return { address }
  }

  const portMatch = raw.match(/[.:](\d+)$/)
  if (portMatch) {
    const address = raw.slice(0, raw.length - portMatch[0].length)
    return { address: address || undefined, port: Number.parseInt(portMatch[1], 10) }
  }

  if (raw.endsWith(':*') || raw.endsWith('.*')) {
    return { address: raw.slice(0, -2) || '*' }
  }

  return { address: raw }
}

function parsePid(token: string | undefined): number | undefined {
  if (!token) return undefined

  const colonMatch = token.match(/:(\d+)/)
  if (colonMatch) {
    const pid = Number.parseInt(colonMatch[1], 10)
    return Number.isNaN(pid) ? undefined : pid
  }

  const leadingMatch = token.match(/^(\d+)/)
  if (leadingMatch) {
    const pid = Number.parseInt(leadingMatch[1], 10)
    if (!Number.isNaN(pid)) return pid
  }

  const trailingMatch = token.match(/(\d+)(?!.*\d)/)
  if (!trailingMatch) return undefined
  const pid = Number.parseInt(trailingMatch[1], 10)
  return Number.isNaN(pid) ? undefined : pid
}
