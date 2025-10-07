import { platform } from 'os'
import * as cap from 'cap'
import { Device } from '@shared/interfaces/common'

type CapDevice = {
  name: string
  description: string
  addresses?: Array<{ addr: string }>
}

export function getDeviceInfo(): Device {
  const deviceList = (cap.deviceList() as CapDevice[]) ?? []

  return {
    os: platform(),
    interfaces: deviceList
      .filter((captured) => Array.isArray(captured.addresses) && captured.addresses.length > 0)
      .map((captured) => ({
        name: captured.name,
        description: captured.description,
        addresses: (captured.addresses ?? []).map((ipaddr) => ipaddr.addr).filter(Boolean)
      }))
  }
}
