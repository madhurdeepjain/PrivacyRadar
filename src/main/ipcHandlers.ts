import { ipcMain } from 'electron'
import { getPrivacySummary, type PrivacySnapshot } from './privacyAgent'
import { logger } from '@infra/logging'

export function setupIPCHandlers(): void {
  ipcMain.handle('get-privacy-summary', async (_event, snapshot: PrivacySnapshot) => {
    try {
      const safeSnapshot: PrivacySnapshot =
        snapshot && typeof snapshot === 'object'
          ? snapshot
          : {
              totalApps: 0,
              totalPackets: 0,
              topApps: [],
              geoSummary: null,
              geoByCountry: null,
              geo: null
            }

      return await getPrivacySummary(safeSnapshot)
    } catch (err) {
      logger.error('[PrivacyAI] IPC handler failed:', err)
      return 'Summary: Unable to analyse this capture.\n\nOverall risk: Unknown\n\nRecommended actions: Try again.'
    }
  })
}
