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
