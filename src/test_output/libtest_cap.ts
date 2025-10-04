import { getDeviceInfo } from '../utils/device-info'
import { setBestInterfaceInfo } from '../utils/interface-utils'
const { Cap, decoders } = require('cap')
const PROTOCOL = decoders.PROTOCOL

async function main() {
  const device = getDeviceInfo()
  setBestInterfaceInfo(device)

  console.log(JSON.stringify(device, null, 2))

  if (!device.bestInterface) {
    console.error('No suitable interface found for capture')
    process.exit(1)
  }

  console.log('Using interface:', device.bestInterface.name)

  const c = new Cap()
  const filter = '' // capture everything for now
  const bufSize = 10 * 1024 * 1024
  const buffer = Buffer.allocUnsafe(bufSize)

  const linkType = c.open(device.bestInterface.name, filter, bufSize, buffer)
  if (c.setMinBytes) c.setMinBytes(0)

  c.on('packet', (nbytes: number, trunc: boolean) => {
    try {
      const ethernet = decoders.Ethernet(buffer);
      const output: any = { ethernet };

      if (ethernet.info.type === PROTOCOL.ETHERNET.IPV4) {
        const ipv4 = decoders.IPV4(buffer, ethernet.offset)
        output.ipv4 = ipv4;

        if (ipv4.info.protocol === PROTOCOL.IP.TCP) {
          const tcp = decoders.TCP(buffer, ipv4.offset)
          output.tcp = tcp;
        } else if (ipv4.info.protocol === PROTOCOL.IP.UDP) {
          const udp = decoders.UDP(buffer, ipv4.offset)
          output.udp = udp;
        }
      } else if (ethernet.info.type === PROTOCOL.ETHERNET.IPV6) {
        const ipv6 = decoders.IPV6(buffer, ethernet.offset)
        output.ipv6 = ipv6;

        if (ipv6.info.protocol === PROTOCOL.IP.TCP) {
          const tcp = decoders.TCP(buffer, ipv6.offset)
          output.tcp = tcp;
        } else if (ipv6.info.protocol === PROTOCOL.IP.UDP) {
          const udp = decoders.UDP(buffer, ipv6.offset)
          output.udp = udp
        }
      }

      console.log(JSON.stringify(output, null, 2))
    } catch (err) {
      console.error('Decode error:', err)
    }
  })
}

main().catch(console.error)