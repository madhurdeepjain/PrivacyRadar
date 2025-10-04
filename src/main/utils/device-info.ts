import { platform } from 'os'
import { Device } from '../interfaces/common'
const Cap = require('cap')

export function getDeviceInfo(): Device {

  //returns all Network Interfaces
  const deviceList = Cap.Cap.deviceList();

  //create a Device object
  const deviceInfo: Device = {
    os: platform(), //returns 'aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', 'win32'

    interfaces: deviceList
      .filter((captured: any) => captured.addresses) //ignore interfaces with no assigned IP
      .map((captured: any) => ({

        name: captured.name,
        description: captured.description,
        addresses: captured.addresses.map((ipaddr: any) => ipaddr.addr)
      }))
  }

  return deviceInfo
}