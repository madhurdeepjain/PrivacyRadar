import { networkInterfaces } from 'os'
import { Device, NetworkInterface } from '@shared/interfaces/common'

function findBestInterface(interfaces: NetworkInterface[]): NetworkInterface | undefined {
  // Prioritize interfaces with IPv4 addresses (non-loopback)
  const bestInterface = interfaces.find((iface) => {
    return iface.addresses.some(
      (addr) => addr && addr !== '127.0.0.1' && !addr.includes(':') && addr.split('.').length === 4
    )
  })
  if (bestInterface) return bestInterface
  // Fallback to any interface with addresses
  const connectedInterfaces = interfaces.filter((iface) => iface.addresses.length > 0)
  return connectedInterfaces.reduce<NetworkInterface | undefined>((best, current) => {
    if (!best) return current
    return current.addresses.length > best.addresses.length ? current : best
  }, undefined)
}

function findMacAddr(networkInterface: NetworkInterface): string | undefined {
  const osInterfaces = networkInterfaces()
  const targetIP = networkInterface.addresses[0]

  for (const addresses of Object.values(osInterfaces)) {
    const match = addresses?.find((addr) => addr.address === targetIP)
    if (match) {
      return match.mac
    }
  }
  return undefined
}

export function setBestInterfaceInfo(device: Device): void {
  const bestInterface = findBestInterface(device.interfaces)

  if (bestInterface) {
    device.bestInterface = bestInterface
    device.mac = findMacAddr(bestInterface)
  }
}
