// Normalize all (+ netstat) IPv6 to match ConnectionManager's format 
export function normalizeIPv6(ipv6: string): string {
  if (!ipv6 || !ipv6.includes(':')) return ipv6

  // Remove zone identifier if present
  let normalized = ipv6.split('%')[0]

  // Handle :: compression
  if (normalized.includes('::')) {
    const parts = normalized.split('::')
    const leftGroups = parts[0] ? parts[0].split(':').filter(g => g) : []
    const rightGroups = parts[1] ? parts[1].split(':').filter(g => g) : []

    // Calculate how many zero groups are needed
    const missingGroups = 8 - leftGroups.length - rightGroups.length
    const zeroGroups = Array(missingGroups).fill('0000')

    // Reconstruct full address
    const allGroups = [...leftGroups, ...zeroGroups, ...rightGroups]
    normalized = allGroups.join(':')
  }

  // Ensure all groups are 4 digits (pad with leading zeros)
  const groups = normalized.split(':')
  const paddedGroups = groups.map(group => group.padStart(4, '0'))

  return paddedGroups.join(':').toLowerCase()
}

// Process IPv6 from Cap's format to normalized format
export function formatIPv6Address(rawAddr: string): string {
  if (!rawAddr) return rawAddr

  const parts = rawAddr.split(':')

  // Handle Cap's 16-element byte array format (each element is a hex byte)
  if (parts.length === 16) {
    const groups: string[] = []

    for (let i = 0; i < 16; i += 2) {
      const byte1 = parts[i] || '0'
      const byte2 = parts[i + 1] || '0'
      const group = (byte1.length === 1 ? '0' + byte1 : byte1) + (byte2.length === 1 ? '0' + byte2 : byte2)
      groups.push(group)
    }

    return normalizeIPv6(groups.join(':'))
  }

  // Handle already formatted IPv6 addresses
  if (parts.length <= 8) {
    return normalizeIPv6(rawAddr);
  }

  console.warn(`Unrecognized IPv6 format: ${rawAddr}`);
  return rawAddr
}