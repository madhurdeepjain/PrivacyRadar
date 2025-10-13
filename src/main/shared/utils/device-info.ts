import { execSync } from 'child_process'
import * as cap from 'cap'
import { Device } from '@shared/interfaces/common'

type CapDevice = {
  name: string
  description?: string
  addresses?: Array<{ addr: string }>
}

type WindowsAdapterInfo = {
  Name?: string
  InterfaceDescription?: string
  InterfaceAlias?: string
  InterfaceGuid?: string
}

let darwinHardwarePortMap: Map<string, string> | null = null
let windowsInterfaceAliasMap: Map<string, string> | null = null
let linuxInterfaceAliasMap: Map<string, string> | null = null

function loadDarwinHardwarePorts(): Map<string, string> {
  if (darwinHardwarePortMap) {
    return darwinHardwarePortMap
  }

  const map = new Map<string, string>()

  try {
    const output = execSync('/usr/sbin/networksetup -listallhardwareports', {
      encoding: 'utf8'
    })

    let currentPort: string | null = null

    output.split('\n').forEach((line) => {
      const trimmed = line.trim()

      if (trimmed.startsWith('Hardware Port:')) {
        currentPort = trimmed.slice('Hardware Port:'.length).trim()
      } else if (trimmed.startsWith('Device:')) {
        const deviceName = trimmed.slice('Device:'.length).trim()
        if (currentPort && deviceName) {
          map.set(deviceName, currentPort)
        }
      } else if (!trimmed) {
        currentPort = null
      }
    })
  } catch {
    // Best-effort enhancement; fall back to default names if the command fails.
  }

  darwinHardwarePortMap = map
  return map
}

function normalizeKey(value: string | undefined): string | undefined {
  return value ? value.trim().toLowerCase() : undefined
}

function loadWindowsInterfaceAliases(): Map<string, string> {
  if (windowsInterfaceAliasMap) {
    return windowsInterfaceAliasMap
  }

  const map = new Map<string, string>()

  try {
    const command =
      'powershell.exe -NoProfile -Command "Get-NetAdapter | Select-Object -Property Name, InterfaceDescription, InterfaceAlias, InterfaceGuid | ConvertTo-Json -Compress -Depth 3"'
    const output = execSync(command, { encoding: 'utf8' })
    const parsed = JSON.parse(output)
    const adapters: WindowsAdapterInfo[] = Array.isArray(parsed) ? parsed : [parsed]

    adapters.forEach((adapter) => {
      const alias = normalizeKey(adapter.InterfaceAlias) ?? normalizeKey(adapter.Name)
      if (!alias) {
        return
      }

      const identifiers = [
        normalizeKey(adapter.Name),
        normalizeKey(adapter.InterfaceDescription),
        normalizeKey(adapter.InterfaceGuid),
        normalizeKey(adapter.InterfaceGuid?.replace(/[{}]/g, ''))
      ]

      identifiers
        .filter((identifier): identifier is string => Boolean(identifier))
        .forEach((identifier) => {
          map.set(identifier, adapter.InterfaceAlias?.trim() ?? adapter.Name?.trim() ?? alias)
        })
    })
  } catch {
    // The lookup is best-effort. Fall back to existing descriptions when PowerShell is unavailable.
  }

  windowsInterfaceAliasMap = map
  return map
}

type LinuxLinkInfo = {
  ifname?: string
  altname?: string[]
  ifalias?: string
  link_type?: string
  operstate?: string
}

function loadLinuxInterfaceAliases(): Map<string, string> {
  if (linuxInterfaceAliasMap) {
    return linuxInterfaceAliasMap
  }

  const map = new Map<string, string>()

  try {
    const output = execSync('ip -json link show', { encoding: 'utf8' })
    const parsed = JSON.parse(output) as LinuxLinkInfo[]

    parsed.forEach((entry) => {
      const friendly =
        entry.ifalias?.trim() ??
        entry.altname?.[0]?.trim() ??
        deriveGenericFriendlyFromName(entry.ifname ?? '')

      if (!friendly) {
        return
      }

      const identifiers = new Set<string>()
      const nameKey = normalizeKey(entry.ifname)
      if (nameKey) identifiers.add(nameKey)
      entry.altname?.forEach((alt) => {
        const normalized = normalizeKey(alt)
        if (normalized) identifiers.add(normalized)
      })

      identifiers.forEach((identifier) => {
        map.set(identifier, friendly)
      })
    })
  } catch {
    // ip(8) may be unavailable (e.g., minimal containers). We fall back to heuristics later.
  }

  linuxInterfaceAliasMap = map
  return map
}

function deriveGenericFriendlyFromName(name: string): string | undefined {
  if (!name) return undefined
  const normalized = name.trim().toLowerCase()
  if (normalized === 'lo' || normalized === 'lo0') return 'Loopback'
  if (
    normalized.startsWith('utun') ||
    normalized.startsWith('ppp') ||
    normalized.startsWith('ipsec')
  ) {
    return 'VPN Tunnel'
  }
  if (normalized.startsWith('gif') || normalized.startsWith('stf')) {
    return 'IPv6 Tunnel'
  }
  if (normalized.startsWith('awdl')) return 'AirDrop'
  if (normalized.startsWith('llw')) return 'Low-Power Wireless'
  if (normalized.startsWith('ap')) return 'Personal Hotspot'
  if (normalized.startsWith('wl') || normalized.startsWith('wi')) return 'Wi-Fi'
  if (
    normalized.startsWith('en') ||
    normalized.startsWith('eth') ||
    normalized.startsWith('em') ||
    /^p\d+p\d+(s\d+)?/.test(normalized)
  ) {
    return 'Ethernet'
  }
  if (
    normalized.startsWith('ww') ||
    normalized.startsWith('ppp') ||
    normalized.startsWith('rmnet')
  ) {
    return 'Cellular'
  }
  if (normalized.startsWith('tun') || normalized.startsWith('tap') || normalized.startsWith('wg')) {
    return 'VPN Tunnel'
  }
  if (
    normalized.startsWith('br') ||
    normalized.startsWith('docker') ||
    normalized.startsWith('veth')
  ) {
    return 'Container Bridge'
  }
  return undefined
}

function resolveWindowsFriendlyName(
  name: string,
  description: string | undefined
): string | undefined {
  const aliases = loadWindowsInterfaceAliases()
  const candidates = [normalizeKey(name), normalizeKey(description)]

  const guidMatch = name.match(/\{([0-9a-fA-F-]+)\}/)
  if (guidMatch) {
    candidates.push(guidMatch[0].toLowerCase(), guidMatch[1].toLowerCase())
  }

  for (const candidate of candidates) {
    if (!candidate) continue
    const match = aliases.get(candidate)
    if (match) {
      return match
    }
  }

  return undefined
}

function resolveLinuxFriendlyName(
  name: string,
  description: string | undefined
): string | undefined {
  const aliases = loadLinuxInterfaceAliases()
  const normalizedName = normalizeKey(name)
  const normalizedDescription = normalizeKey(description)

  if (normalizedName) {
    const mappedName = aliases.get(normalizedName)
    if (mappedName) return mappedName
  }

  if (normalizedDescription) {
    const mappedDescription = aliases.get(normalizedDescription)
    if (mappedDescription) return mappedDescription
  }

  return deriveGenericFriendlyFromName(name)
}

function resolveFriendlyName(
  osName: NodeJS.Platform,
  name: string,
  description: string | undefined
): string | undefined {
  const normalizedName = name.trim()
  const normalizedDescription = description?.trim()

  if (osName === 'darwin') {
    const hardwarePort = loadDarwinHardwarePorts().get(normalizedName)
    if (hardwarePort) {
      return hardwarePort
    }
  }

  if (osName === 'win32') {
    const windowsAlias = resolveWindowsFriendlyName(normalizedName, normalizedDescription)
    if (windowsAlias) {
      return windowsAlias
    }
  }

  if (osName === 'linux') {
    const linuxAlias = resolveLinuxFriendlyName(normalizedName, normalizedDescription)
    if (linuxAlias) {
      return linuxAlias
    }
  }

  const genericFriendly = deriveGenericFriendlyFromName(normalizedName)
  if (genericFriendly) {
    return genericFriendly
  }

  if (normalizedDescription && normalizedDescription.length > 0) {
    return normalizedDescription
  }

  return normalizedName
}

export function getDeviceInfo(): Device {
  const deviceList = (cap.deviceList() as CapDevice[]) ?? []
  const osName = process.platform

  return {
    os: osName,
    interfaces: deviceList
      .filter((captured) => Array.isArray(captured.addresses) && captured.addresses.length > 0)
      .map((captured) => {
        const addresses = (captured.addresses ?? []).map((ipaddr) => ipaddr.addr).filter(Boolean)
        const friendlyName = resolveFriendlyName(osName, captured.name, captured.description)

        return {
          name: captured.name,
          description: captured.description ?? captured.name,
          addresses,
          friendlyName
        }
      })
  }
}
