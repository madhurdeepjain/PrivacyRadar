import { PacketMetadata } from '../interfaces/common'
import { PacketDecoder } from './packet-decoder'
const Cap = require('cap');

/*
  Uses cap library for packet capture. captured
  packets are stored in a buffer by cap, copied 
  into userspace, decoded, and placed in a 
  separate buffer to be flushed
*/

export class TrafficCapture {
  private capture: any
  private buffer: Buffer
  private running: boolean = false
  private packetQueue: PacketMetadata[] = []
  private linkType: string = ''
  private decoder: PacketDecoder

  //pass in name of the "best" interface
  constructor(private deviceName: string) {
    this.capture = new Cap.Cap()
    this.buffer = Buffer.alloc(65535) //64K (Max TCP segment size)
    this.decoder = new PacketDecoder()
  }

  start(): void {
    if (this.running) return
    this.running = true

    const filter = ''
    const buffSize = 0xA00000 //10 MB buffer for cap

    //Open device for capture. kernel buffer writes to this.buffer
    const linkTypeResult = this.capture.open(this.deviceName, filter, buffSize, this.buffer) //"Ethernet", "wifi", etc
    this.linkType = String(linkTypeResult)

    //whenever a new packet comes in
    this.capture.on('packet', (nbytes: number) => { 
      const packetCopy = Buffer.allocUnsafe(nbytes)
      this.buffer.copy(packetCopy, 0, 0, nbytes) //immediately copy frame into our buffer

      const metadata = this.decoder.decode(packetCopy, nbytes) //decode entire frame
      if (metadata) {
        this.packetQueue.push(metadata)
      }
    })

    console.log('Traffic capture started...')
  }

  stop(): void {
    if (!this.running) return
    this.capture.close()
    this.running = false
    console.log('Traffic capture stopped')
  }

  flushQueue(): PacketMetadata[] {
    const queue = [...this.packetQueue] //copy all elements
    this.packetQueue = []
    return queue
  }
}