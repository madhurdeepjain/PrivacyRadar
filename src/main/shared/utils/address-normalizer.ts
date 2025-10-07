import { logger } from '@infra/logging'

export function normalizeIPv6(ipv6: string): string {
  if (!ipv6 || !ipv6.includes(':')) return ipv6

  let normalized = ipv6.split('%')[0]

  if (normalized.includes('::')) {
    const parts = normalized.split('::')
    const leftGroups = parts[0] ? parts[0].split(':').filter((g) => g) : []
    const rightGroups = parts[1] ? parts[1].split(':').filter((g) => g) : []

    const missingGroups = 8 - leftGroups.length - rightGroups.length
    const zeroGroups = Array(missingGroups).fill('0000')

    const allGroups = [...leftGroups, ...zeroGroups, ...rightGroups]
    normalized = allGroups.join(':')
  }

  const groups = normalized.split(':')
  const paddedGroups = groups.map((group) => group.padStart(4, '0'))

  return paddedGroups.join(':').toLowerCase()
}

export function formatIPv6Address(rawAddr: string): string {
  if (!rawAddr) return rawAddr

  const parts = rawAddr.split(':')

  if (parts.length === 16) {
    const groups: string[] = []

    for (let i = 0; i < 16; i += 2) {
      const byte1 = parts[i] || '0'
      const byte2 = parts[i + 1] || '0'
      const paddedByte1 = byte1.length === 1 ? `0${byte1}` : byte1
      const paddedByte2 = byte2.length === 1 ? `0${byte2}` : byte2
      groups.push(`${paddedByte1}${paddedByte2}`)
    }

    return normalizeIPv6(groups.join(':'))
  }

  if (parts.length <= 8) {
    return normalizeIPv6(rawAddr)
  }

  logger.warn('Unrecognized IPv6 format', rawAddr)
  return rawAddr
}
