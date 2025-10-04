import {networkInterfaces} from 'os';
import {Device, NetworkInterface} from '../interfaces/common';

function findBestInterface(interfaces: NetworkInterface[]): NetworkInterface | undefined {

  const connectedInterfaces = interfaces.filter(iface => iface.addresses.length > 0)
  return connectedInterfaces.reduce((best, current) =>
    current.addresses.length > best.addresses.length ? current : best)
}

function findMacAddr(networkInterface: NetworkInterface): string | undefined {

  const osInterfaces = networkInterfaces()
  const targetIP = networkInterface.addresses[0] // Use first IP...in theory they should all work
  
  for (const addresses of Object.values(osInterfaces)) {

    const match = addresses?.find(addr => addr.address === targetIP)

    if (match) {
      return match.mac
    }
  }
  return undefined
}

//selects the best interface for the Device
export function setBestInterfaceInfo(device: Device): void {

  const bestInterface = findBestInterface(device.interfaces)

  if(bestInterface) {
    device.bestInterface = bestInterface
    device.mac = findMacAddr(bestInterface)
  }
    /*
      console.log(`Operating System: ${device.os}`)
      device.interfaces.forEach((iface: NetworkInterface) => {
        console.log(`Interface: ${iface.description}`)
        console.log(`Device: ${iface.name}`)
        iface.addresses.forEach(ip => console.log(`  IP: ${ip}`))
        console.log('---')
      })
        console.log('Best interface:', device.bestInterface?.description)
        console.log('MAC address:', device.mac)
        */
}