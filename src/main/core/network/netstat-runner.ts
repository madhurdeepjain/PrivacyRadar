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

  let inActiveConnections = false
  let header: HeaderLayout | null = null

  output.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim()
    if (!trimmedLine) return

    const normalizedLine = trimmedLine.toLowerCase()

    if (normalizedLine.includes('active') && normalizedLine.includes('connections')) {
      inActiveConnections = true
      return
    }

    if (inActiveConnections && normalizedLine.startsWith('proto')) {
      header = extractHeader(trimmedLine)
      return
    }

    if (
      inActiveConnections &&
      header &&
      (normalizedLine.startsWith('tcp') || normalizedLine.startsWith('udp'))
    ) {
      const parsed = parseDataLine(trimmedLine, header)
      if (parsed) rows.push(parsed)
      return
    }

    inActiveConnections = false
    header = null
  })

  return rows
}

type HeaderLayout = string[]

function extractHeader(line: string): HeaderLayout | null {
  const normalizedLine = line
    .toLowerCase()
    .replace(/\(state\)/g, 'state')
    .replace(/local address/g, 'local_address')
    .replace(/foreign address/g, 'foreign_address')
    .replace(/pid\/program name/g, 'pid/program_name')
    .replace(/process name/g, 'process_name')
    .replace(/\s+/g, ' ')
    .trim()

  if (
    !normalizedLine.includes('proto') ||
    !normalizedLine.includes('local_address') ||
    !normalizedLine.includes('foreign_address')
  ) {
    return null
  }

  return normalizedLine.split(' ')
}

function parseDataLine(line: string, header: HeaderLayout | null): NetstatRow | null {
  if (!header) return null

  const protoIndex = header.indexOf('proto')
  const localIndex = header.indexOf('local_address')
  const foreignIndex = header.indexOf('foreign_address')

  if (protoIndex === -1 || localIndex === -1 || foreignIndex === -1) return null

  const dataColumns = line.trim().split(/\s+/)

  const protocolToken = dataColumns[protoIndex]?.toUpperCase()
  if (!protocolToken || (!protocolToken.startsWith('TCP') && !protocolToken.startsWith('UDP')))
    return null

  const stateIndex = header.indexOf('state')
  const pidIndex = header.findIndex((headerColumn) => headerColumn.includes('pid'))

  if (
    protocolToken.startsWith('UDP') &&
    stateIndex !== -1 &&
    dataColumns.length === header.length - 1
  ) {
    dataColumns.splice(stateIndex, 0, '')
  }

  const localRaw = dataColumns[localIndex]
  const remoteRaw = dataColumns[foreignIndex]

  if (!localRaw || !remoteRaw) return null

  const stateRaw = stateIndex !== -1 ? dataColumns[stateIndex] : undefined
  const state = stateRaw?.replace(/[()]/g, '').trim() || undefined

  const pidColumnLabel = pidIndex !== -1 ? header[pidIndex] : undefined
  const pid = extractPid(dataColumns, pidIndex, pidColumnLabel)

  return {
    protocol: protocolToken,
    local: parseEndpoint(localRaw.trim()),
    remote: parseEndpoint(remoteRaw.trim()),
    state,
    pid
  }
}

function extractPid(
  dataColumns: string[],
  pidIndex: number,
  pidColumnLabel?: string
): number | undefined {
  if (pidIndex === -1 || !pidColumnLabel) return undefined

  const rawValue = dataColumns[pidIndex]
  if (!rawValue) return undefined

  if (pidColumnLabel === 'pid/program_name') {
    const [pidPart] = rawValue.split('/')
    return parsePid(pidPart)
  }

  if (pidColumnLabel === 'process:pid') {
    const pattern = /:(\d+)$/
    for (let idx = pidIndex; idx < dataColumns.length; idx += 1) {
      const match = dataColumns[idx].match(pattern)
      if (match) {
        return parsePid(match[1])
      }
    }
    return undefined
  }

  return parsePid(rawValue)
}

function parsePid(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
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
