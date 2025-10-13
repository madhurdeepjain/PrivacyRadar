import * as cap from 'cap'
import { PacketMetadata } from '@shared/interfaces/common'
import { logger } from '@infra/logging'
import { PacketDecoder } from './packet-decoder'

type CapInstance = InstanceType<typeof cap.Cap>

export class TrafficCapture {
  private readonly deviceNames: string[]
  private readonly captures: CapInstance[]
  private readonly buffers: Buffer[]
  private running = false
  private packetQueue: PacketMetadata[] = []
  private readonly decoder: PacketDecoder

  constructor(deviceNames: string | string[]) {
    this.deviceNames = Array.isArray(deviceNames) ? deviceNames : [deviceNames]
    this.captures = this.deviceNames.map(() => new cap.Cap())
    this.buffers = this.deviceNames.map(() => Buffer.alloc(65535))
    this.decoder = new PacketDecoder()
  }

  start(): void {
    if (this.running) return
    this.running = true

    const filter = ''
    const buffSize = 0xa00000

    this.captures.forEach((capture, index) => {
      const deviceName = this.deviceNames[index]
      const buffer = this.buffers[index]

      const linkTypeResult = capture.open(deviceName, filter, buffSize, buffer)

      capture.on('packet', (nbytes: number) => {
        const packetCopy = Buffer.allocUnsafe(nbytes)
        buffer.copy(packetCopy, 0, 0, nbytes)

        const metadata = this.decoder.decode(packetCopy, nbytes)
        if (metadata) {
          this.packetQueue.push(metadata)
        }
      })

      logger.info('Traffic capture started', {
        device: deviceName,
        linkType: String(linkTypeResult)
      })
    })
  }

  stop(): void {
    if (!this.running) return
    this.captures.forEach((capture, index) => {
      try {
        capture.close()
      } catch (error) {
        logger.warn('Failed to close traffic capture', {
          device: this.deviceNames[index],
          error
        })
      }
    })
    this.running = false
    logger.info('Traffic capture stopped', { devices: this.deviceNames })
  }

  flushQueue(): PacketMetadata[] {
    const queue = [...this.packetQueue]
    this.packetQueue = []
    return queue
  }
}
