import { expect, test } from '@playwright/test'
import type { PacketMetadata } from '../../src/main/shared/interfaces/common'

declare global {
  interface Window {
    __emitPacket?: (packet: PacketMetadata) => void
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(packet: PacketMetadata) => void>()

    window.api = {
      onNetworkData: (callback) => {
        listeners.add(callback)
      },
      removeNetworkDataListener: () => {
        listeners.clear()
      }
    } as Window['api']

    window.electron = {
      process: {
        versions: {
          electron: '0.0.0-test',
          chrome: '0.0.0-test',
          node: '0.0.0-test'
        }
      }
    } as unknown as Window['electron']

    window.__emitPacket = (packet: PacketMetadata) => {
      listeners.forEach((listener) => listener(packet))
    }
  })
})

test('renders live dashboard and updates for new packets', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /privacyradar/i })).toBeVisible()
  await expect(page.getByText(/waiting for packets/i)).toBeVisible()

  await page.evaluate(() => {
    window.__emitPacket?.({
      procName: 'Browser',
      pid: 1010,
      size: 1024,
      srcIP: '10.0.0.5',
      dstIP: '8.8.8.8',
      srcport: 55555,
      dstport: 443,
      protocol: 'TCP',
      timestamp: Date.now(),
      ethernet: {
        srcmac: '00:00:5e:00:53:af',
        dstmac: 'ff:ff:ff:ff:ff:ff',
        type: 2048
      }
    } as PacketMetadata)
  })

  await expect(page.getByText(/streaming now/i)).toBeVisible()
  await expect(page.getByText(/browser/i).first()).toBeVisible()
  await expect(page.getByText(/pid\s+1010/i).first()).toBeVisible()
})

test('switches between Network Monitor and System Monitor views', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /network monitor/i })).toBeVisible()

  const systemMonitorButton = page.getByRole('button', { name: /system monitor/i }).first()
  await systemMonitorButton.click()

  await expect(page.getByRole('heading', { level: 1, name: /system monitor/i })).toBeVisible({
    timeout: 10000
  })

  const networkMonitorButton = page.getByRole('button', { name: /network monitor/i }).first()
  await networkMonitorButton.click()

  await expect(page.getByRole('heading', { level: 1, name: /network monitor/i })).toBeVisible({
    timeout: 10000
  })
})

test('displays multiple packets correctly', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText(/waiting for packets/i)).toBeVisible()

  await page.evaluate(() => {
    const packets: PacketMetadata[] = [
      {
        procName: 'Chrome',
        pid: 1001,
        size: 1024,
        srcIP: '192.168.1.1',
        dstIP: '8.8.8.8',
        srcport: 50000,
        dstport: 443,
        protocol: 'TCP',
        timestamp: Date.now(),
        ethernet: {
          srcmac: '00:00:5e:00:53:af',
          dstmac: 'ff:ff:ff:ff:ff:ff',
          type: 2048
        }
      },
      {
        procName: 'Firefox',
        pid: 1002,
        size: 2048,
        srcIP: '192.168.1.2',
        dstIP: '1.1.1.1',
        srcport: 50001,
        dstport: 53,
        protocol: 'UDP',
        timestamp: Date.now() + 1,
        ethernet: {
          srcmac: '00:00:5e:00:53:af',
          dstmac: 'ff:ff:ff:ff:ff:ff',
          type: 2048
        }
      }
    ]

    packets.forEach((packet) => {
      window.__emitPacket?.(packet)
    })
  })

  await expect(page.getByText(/chrome/i).first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/firefox/i).first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/1001/i).first()).toBeVisible()
  await expect(page.getByText(/1002/i).first()).toBeVisible()
})

test('handles empty state when no packets received', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText(/waiting for packets/i)).toBeVisible()
  await expect(page.getByText(/streaming now/i)).not.toBeVisible()
})

test('persists view mode setting', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: /network monitor/i })).toBeVisible()

  const systemMonitorButton = page.getByRole('button', { name: /system monitor/i }).first()
  await systemMonitorButton.click()

  await expect(page.getByRole('heading', { level: 1, name: /system monitor/i })).toBeVisible({
    timeout: 10000
  })

  await expect(page.getByRole('heading', { level: 1, name: /network monitor/i })).not.toBeVisible()

  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: /system monitor/i })).toBeVisible({
    timeout: 10000
  })

  await expect(page.getByRole('heading', { level: 1, name: /network monitor/i })).not.toBeVisible()
})
