import { startApp } from '@app/bootstrap'
import { logger } from '@infra/logging'

startApp().catch((error) => {
  logger.error('Failed to bootstrap application', error)
})
