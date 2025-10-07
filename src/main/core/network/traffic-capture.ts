import * as cap from 'cap'
import { PacketMetadata } from '@shared/interfaces/common'
import { logger } from '@infra/logging'
import { PacketDecoder } from './packet-decoder'

type CapInstance = InstanceType<typeof cap.Cap>

export class TrafficCapture {
  private readonly capture: CapInstance
  private readonly buffer: Buffer
  private running = false
  private packetQueue: PacketMetadata[] = []
  private linkType: string = ''
  private readonly decoder: PacketDecoder

  constructor(private readonly deviceName: string) {
    this.capture = new cap.Cap()
    this.buffer = Buffer.alloc(65535)
    this.decoder = new PacketDecoder()
  }

  start(): void {
    if (this.running) return
    this.running = true

    const filter = ''
    const buffSize = 0xa00000

    const linkTypeResult = this.capture.open(this.deviceName, filter, buffSize, this.buffer)
    this.linkType = String(linkTypeResult)

    this.capture.on('packet', (nbytes: number) => {
      const packetCopy = Buffer.allocUnsafe(nbytes)
      this.buffer.copy(packetCopy, 0, 0, nbytes)

      const metadata = this.decoder.decode(packetCopy, nbytes)
      if (metadata) {
        this.packetQueue.push(metadata)
      }
    })

    logger.info('Traffic capture started', { device: this.deviceName, linkType: this.linkType })
  }

  stop(): void {
    if (!this.running) return
    this.capture.close()
    this.running = false
    logger.info('Traffic capture stopped')
  }

  flushQueue(): PacketMetadata[] {
    const queue = [...this.packetQueue]
    this.packetQueue = []
    return queue
  }
}
