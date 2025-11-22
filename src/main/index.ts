import { registerAiHandlers } from './ai/ipcHandlers'
import { startApp } from '@app/bootstrap'
import { logger } from '@infra/logging'
import 'dotenv/config'

// register AI IPC handlers
registerAiHandlers()

startApp().catch((error) => {
  logger.error('Failed to bootstrap application', error)
})
