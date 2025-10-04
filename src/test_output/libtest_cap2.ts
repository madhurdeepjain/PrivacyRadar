import { getDeviceInfo } from '../utils/device-info'
import { setBestInterfaceInfo } from '../utils/interface-utils'
const Cap = require('cap');

class PacketCaptureTest {
  private capture: any
  private buffer: Buffer
  private running = false

  constructor(private deviceName: string) {
    this.capture = new Cap.Cap()
    this.buffer = Buffer.alloc(65535)
  }

  start() {
    if (this.running) return
    this.running = true

    const filter = ""
    const buffSize = 0xA00000

    const decoders = Cap.decoders
    const PROTOCOL = decoders.PROTOCOL

    try {
      const linkType = this.capture.open(this.deviceName, filter, buffSize, this.buffer)
      console.log(`Link Type: ${linkType}`)
      console.log('Capture started - dumping decoded packets...\n')

      this.capture.on("packet", (nbytes: number, trunc: boolean) => {
        try {
          const eth = decoders.Ethernet(this.buffer, 0)

          const out: any = {
            ethernet: eth.info
          }

          if (eth.info.type === PROTOCOL.ETHERNET.IPV4) {
            const ipv4 = decoders.IPV4(this.buffer, eth.offset)
            out.ipv4 = ipv4.info

            if (ipv4.info.protocol === PROTOCOL.IP.TCP) {
              const tcp = decoders.TCP(this.buffer, ipv4.offset)
              out.tcp = tcp.info
            } else if (ipv4.info.protocol === PROTOCOL.IP.UDP) {
              const udp = decoders.UDP(this.buffer, ipv4.offset)
              out.udp = udp.info
            }
          } else if (eth.info.type === PROTOCOL.ETHERNET.IPV6) {
            const ipv6 = decoders.IPV6(this.buffer, eth.offset)
            out.ipv6 = ipv6.info
          }

          // Print whole object as JSON
          console.log(JSON.stringify(out, null, 2))
        } catch (err) {
          console.error("Decode error:", err)
        }
      })

      this.capture.on('error', (err: any) => {
        console.error('Capture error:', err)
      })

    } catch (error) {
      console.error('Failed to start capture:', error)
    }
  }
}

// Main test
async function testPacketCapture(): Promise<void> {
  const device = getDeviceInfo()
  setBestInterfaceInfo(device)

  if (!device.bestInterface) {
    console.log('No suitable interface found');
    return
  }

  const test = new PacketCaptureTest(device.bestInterface.name);
  test.start()
}


testPacketCapture().catch(console.error)