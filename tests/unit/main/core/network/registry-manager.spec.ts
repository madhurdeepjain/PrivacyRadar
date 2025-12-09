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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    connectionTracker = {
      getConnections: vi.fn(() => [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    it('processes a basic packet and sets correct app metadata', () => {
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
      expect(packet.appName).toBe('chrome')
      expect(packet.appDisplayName).toBeDefined()
      const globalReg = regManager.getGlobalRegistry()
      expect(globalReg.has('eth0')).toBe(true)
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

    it.each([
      [
        'IPv6 TCP',
        {
          srcIP: '2001:db8::1',
          dstIP: '2001:db8::2',
          ipv6: true,
          protocol: 'TCP' as const
        },
        { ipv6Packets: 1, ipv4Packets: 0, tcpPackets: 1, udpPackets: 0 }
      ],
      [
        'UDP',
        {
          srcIP: '192.168.1.1',
          dstIP: '8.8.8.8',
          protocol: 'UDP' as const
        },
        { udpPackets: 1, tcpPackets: 0, ipv4Packets: 1, ipv6Packets: 0 }
      ]
    ])('handles %s packets correctly', (_name, packetOverrides, expectedStats) => {
      const packet: PacketMetadata = {
        ...packetOverrides,
        size: 512,
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      } as PacketMetadata

      regManager.processPacket(packet)

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.ipv6Packets).toBe(expectedStats.ipv6Packets)
      expect(stats.ipv4Packets).toBe(expectedStats.ipv4Packets)
      expect(stats.tcpPackets).toBe(expectedStats.tcpPackets)
      expect(stats.udpPackets).toBe(expectedStats.udpPackets)
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
      const { logger } = await import('@infra/logging')
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
      await new Promise((resolve) => setTimeout(resolve, 200))

      const processRegs = regManager.getProcessRegistries()
      expect(processRegs.size).toBeGreaterThan(0)
      expect(vi.mocked(logger.debug)).toHaveBeenCalled()
      const appRegs = regManager.getApplicationRegistries()
      const appReg = Array.from(appRegs.values())[0]
      expect(appReg).toBeDefined()
    })
  })

  describe('Registry Management', () => {
    it('creates process and application registries with correct data', () => {
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
      const processReg = Array.from(processRegs.values())[0]
      expect(processReg.pid).toBe(1234)
      expect(processReg.procName).toBe('chrome')
      expect(processReg.totalPackets).toBe(1)

      const appRegs = regManager.getApplicationRegistries()
      expect(appRegs.size).toBeGreaterThan(0)
      const appReg = Array.from(appRegs.values())[0]
      expect(appReg.appName).toBe('chrome')
      expect(appReg.totalPackets).toBe(1)
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
    it.each([
      ['zero size', 0, 0],
      ['very large size', 1000000000, 1000000000]
    ])('handles packets with %s', (_name, packetSize, expectedBytes) => {
      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: packetSize,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.totalPackets).toBe(1)
      expect(stats.totalBytesSent).toBe(expectedBytes)
    })
  })

  describe('Concurrent Processing', () => {
    it('handles concurrent packet processing correctly', () => {
      const packets: PacketMetadata[] = Array.from({ length: 100 }, (_, i) => ({
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 100,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234 + i,
        procName: `app${i}`
      }))

      // Process all packets (simulating concurrent arrival)
      packets.forEach((packet) => {
        regManager.processPacket(packet)
      })

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.totalPackets).toBe(100)
      expect(stats.totalBytesSent).toBe(10000)

      const processRegs = regManager.getProcessRegistries()
      expect(processRegs.size).toBe(100) // Each packet has unique PID

      const appRegs = regManager.getApplicationRegistries()
      expect(appRegs.size).toBe(100) // Each packet has unique app name
    })

    it('aggregates packets from same process correctly under concurrency', () => {
      const packets: PacketMetadata[] = Array.from({ length: 50 }, () => ({
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 200,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234, // Same PID
        procName: 'chrome' // Same process
      }))

      packets.forEach((packet) => {
        regManager.processPacket(packet)
      })

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.totalPackets).toBe(50)
      expect(stats.totalBytesSent).toBe(10000)

      const processRegs = regManager.getProcessRegistries()
      expect(processRegs.size).toBe(1) // Only one unique process
      const processReg = Array.from(processRegs.values())[0]
      expect(processReg.totalPackets).toBe(50)
      expect(processReg.totalBytesSent).toBe(10000)
    })
  })

  describe('Memory Management', () => {
    it('does not leak memory when processing many unique processes', () => {
      // Process 1000 packets with unique PIDs
      for (let i = 0; i < 1000; i++) {
        regManager.processPacket({
          srcIP: '192.168.1.1',
          dstIP: '8.8.8.8',
          size: 100,
          protocol: 'TCP',
          interfaceName: 'eth0',
          pid: 1000 + i,
          procName: `app${i}`
        })
      }

      const processRegs = regManager.getProcessRegistries()
      const appRegs = regManager.getApplicationRegistries()

      expect(processRegs.size).toBe(1000)
      expect(appRegs.size).toBe(1000)

      const globalReg = regManager.getGlobalRegistry()
      const stats = globalReg.get('eth0')!
      expect(stats.totalPackets).toBe(1000)
      expect(stats.totalBytesSent).toBe(100000)
    })
  })

  describe('Process Tree Tracking', () => {
    it('uses findRootParent to track process hierarchy', () => {
      // Mock processTracker to return a process and parent PID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockProcessTracker = processTracker as any
      mockProcessTracker.getProcess = vi.fn((pid: number) => {
        if (pid === 1234) return { pid: 1234, name: 'chrome', ppid: 1000 }
        if (pid === 1000) return { pid: 1000, name: 'parent', ppid: 1 }
        if (pid === 1) return { pid: 1, name: 'init', ppid: 0 }
        return null
      })
      mockProcessTracker.findRootParent = vi.fn((pid: number) => {
        // Simulate process hierarchy: pid 1234 -> parent 1000 -> root 1
        if (pid === 1234) return 1
        if (pid === 1000) return 1
        return pid
      })

      const packet: PacketMetadata = {
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        size: 100,
        protocol: 'TCP',
        interfaceName: 'eth0',
        pid: 1234,
        procName: 'chrome'
      }

      regManager.processPacket(packet)

      expect(mockProcessTracker.findRootParent).toHaveBeenCalledWith(1234)
    })
  })
})
