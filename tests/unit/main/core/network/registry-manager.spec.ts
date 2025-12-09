import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RegManager } from '@main/core/network/registry-manager'
import { ProcessTracker } from '@main/core/network/process-tracker'
import { ConnectionTracker } from '@main/core/network/connection-tracker'
import { GeoLocationService } from '@main/core/network/geo-location'
import type { PacketMetadata } from '@shared/interfaces/common'

vi.mock('@infra/logging', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@config/constants', () => ({
  FRIENDLY_APP_NAMES: {
    chrome: 'Chrome',
    firefox: 'Firefox'
  }
}))

describe('RegManager', () => {
  let regManager: RegManager
  let processTracker: ProcessTracker
  let connectionTracker: ConnectionTracker
  let mockGeoService: {
    lookup: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

    processTracker = {
      getProcess: vi.fn(),
      findRootParent: vi.fn((pid: number) => pid)
    } as any

    connectionTracker = {
      getConnections: vi.fn(() => [])
    } as any

    mockGeoService = {
      lookup: vi.fn().mockResolvedValue({
        country: 'US',
        city: 'New York',
        as: 12345
      }),
      close: vi.fn().mockResolvedValue(undefined)
    }

    vi.spyOn(GeoLocationService.prototype, 'lookup').mockImplementation(mockGeoService.lookup)
    vi.spyOn(GeoLocationService.prototype, 'close').mockImplementation(mockGeoService.close)

    regManager = new RegManager(
      processTracker as ProcessTracker,
      connectionTracker as ConnectionTracker,
      ['192.168.1.1', '10.0.0.1']
    )
  })

  afterEach(async () => {
    if (regManager) {
      await regManager.close()
    }
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('processPacket', () => {
    it('processes a basic packet', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      expect(packet.appRegistryID).toBeDefined()
      expect(packet.appName).toBeDefined()
      expect(packet.appDisplayName).toBeDefined()
    })

    it('handles system traffic', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 0,
        procName: 'SYSTEM'
      }

      regManager.processPacket(packet)

      expect(packet.appName).toBe('System')
      expect(packet.appRegistryID).toBe('system')
    })

    it('handles unknown processes', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 9999,
        procName: 'UNKNOWN'
      }

      regManager.processPacket(packet)

      expect(packet.appName).toBe('Unknown')
      expect(packet.appRegistryID).toBe('unknown')
    })

    it('handles packets without PID', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'ICMP',
        interfaceName: 'eth0'
      }

      regManager.processPacket(packet)

      expect(packet.appName).toBeDefined()
    })

    it('updates global registry stats', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      const globalReg = regManager.getGlobalRegistry()
      expect(globalReg.has('eth0')).toBe(true)
      const stats = globalReg.get('eth0')!
      expect(stats.totalPackets).toBe(1)
      expect(stats.totalBytesSent).toBe(1024)
    })

    it('handles IPv6 packets', () => {
      const packet: PacketMetadata = {
        srcIP: '2001:db8::1',
        dstIP: '2001:db8::2',
        size: 512,
        protocol: 'TCP',
        interfaceName: 'eth0',
        ipv6: true,
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.ipv6Packets).toBe(1)
      expect(stats.ipv4Packets).toBe(0)
    })

    it('handles UDP packets', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 512,
        protocol: 'UDP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.udpPackets).toBe(1)
      expect(stats.tcpPackets).toBe(0)
    })
  })

  describe('GeoLocation', () => {
    it('triggers geo lookup for outbound packets', async () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      // Wait for async geo lookup
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockGeoService.lookup).toHaveBeenCalledWith('8.8.8.8')
    })

    it('handles geo lookup failures gracefully', async () => {
      mockGeoService.lookup.mockRejectedValueOnce(new Error('Geo lookup failed'))

      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      // Wait for async geo lookup
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should not crash
      const processRegs = regManager.getProcessRegistries()
      expect(processRegs.size).toBeGreaterThan(0)
    })
  })

  describe('Registry Management', () => {
    it('creates process registries correctly', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      const processRegs = regManager.getProcessRegistries()
      expect(processRegs.size).toBeGreaterThan(0)
    })

    it('creates application registries correctly', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      const appRegs = regManager.getApplicationRegistries()
      expect(appRegs.size).toBeGreaterThan(0)
    })

    it('aggregates multiple packets for same process', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      // Process same packet multiple times
      regManager.processPacket(packet)
      regManager.processPacket(packet)
      regManager.processPacket(packet)

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.totalPackets).toBe(3)
      expect(stats.totalBytesSent).toBe(3072)
    })

    it('handles packets from different interfaces', () => {
      const packet1: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1024,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      const packet2: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 512,
        protocol: 'UDP',
        interfaceName: 'wlan0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet1)
      regManager.processPacket(packet2)

      const globalReg = regManager.getGlobalRegistry()
      expect(globalReg.has('eth0')).toBe(true)
      expect(globalReg.has('wlan0')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('handles packets with missing fields', () => {
      const packet: Partial<PacketMetadata> = {
        size: 1024,
        protocol: 'TCP'
      }

      regManager.processPacket(packet as PacketMetadata)

      // Should not crash
      const globalReg = regManager.getGlobalRegistry()
      expect(globalReg.size).toBeGreaterThanOrEqual(0)
    })

    it('handles packets with zero size', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 0,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.totalPackets).toBe(1)
      expect(stats.totalBytesSent).toBe(0)
    })

    it('handles packets with very large size', () => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 1000000000, // 1GB
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.totalBytesSent).toBe(1000000000)
    })
  })

  describe('close', () => {
    it('closes geo service properly', async () => {
      await regManager.close()
      expect(mockGeoService.close).toHaveBeenCalled()
    })
  })
})
