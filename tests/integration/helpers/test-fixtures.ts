import type { PacketMetadata } from '../../../src/main/shared/interfaces/common'

export function createMockPacket(overrides?: Partial<PacketMetadata>): PacketMetadata {
  return {
    procName: 'test-process',
    pid: 1234,
    size: 1024,
    srcIP: '192.168.1.100',
    dstIP: '8.8.8.8',
    srcport: 54321,
    dstport: 443,
    protocol: 'TCP',
    timestamp: Date.now(),
    ethernet: {
      srcmac: '00:11:22:33:44:55',
      dstmac: '66:77:88:99:aa:bb',
      type: 2048
    },
    ...overrides
  }
}
