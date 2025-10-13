import { networkInterfaces } from 'os'
import { Device, NetworkInterface } from '@shared/interfaces/common'

function selectByFriendlySubstring(
  interfaces: NetworkInterface[],
  keyword: string
): NetworkInterface | undefined {
  let winner: NetworkInterface | undefined

  interfaces.forEach((iface) => {
    const friendly = iface.friendlyName?.toLowerCase() ?? ''
    if (!friendly.includes(keyword)) {
      return
    }

    if (!winner || iface.addresses.length > winner.addresses.length) {
      winner = iface
    }
  })

  return winner
}

function findBestInterface(interfaces: NetworkInterface[]): NetworkInterface | undefined {
  const withAddresses = interfaces.filter((iface) => iface.addresses.length > 0)
  if (withAddresses.length === 0) {
    return undefined
  }

  const wifi =
    selectByFriendlySubstring(withAddresses, 'wi-fi') ??
    selectByFriendlySubstring(withAddresses, 'wifi')
  if (wifi) {
    return wifi
  }

  const ethernet = selectByFriendlySubstring(withAddresses, 'ethernet')
  if (ethernet) {
    return ethernet
  }

  return withAddresses.reduce<NetworkInterface | undefined>((best, current) => {
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
