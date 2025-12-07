import { app } from 'electron'
import { startApp } from '@app/bootstrap'
import { logger } from '@infra/logging'

// Disable sandbox on Linux (needed for system monitoring)
function configureLinuxSandboxEarly(): void {
  if (process.platform !== 'linux') {
    return
  }

  app.commandLine.appendSwitch('--no-sandbox')
}

configureLinuxSandboxEarly()

startApp().catch((error) => {
  logger.error('Failed to bootstrap application', error)
})
