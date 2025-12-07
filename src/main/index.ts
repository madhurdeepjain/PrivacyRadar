import { app } from 'electron'
import { startApp } from '@app/bootstrap'
import { logger } from '@infra/logging'
import { existsSync, statSync } from 'fs'
import { join } from 'path'

// Disable sandbox on Linux if not properly configured (needed for system monitoring)
function configureLinuxSandboxEarly(): void {
  if (process.platform !== 'linux') {
    return
  }

  const electronPath =
    process.resourcesPath ||
    (process.defaultApp ? join(__dirname, '../../node_modules/electron/dist') : process.execPath)
  const sandboxPath = join(electronPath, 'chrome-sandbox')

  if (existsSync(sandboxPath)) {
    try {
      const stats = statSync(sandboxPath)
      const hasSetuid = (stats.mode & 0o4000) !== 0
      const isOwnedByRoot = stats.uid === 0

      if (hasSetuid && isOwnedByRoot) {
        return // Sandbox is configured, don't disable
      }
    } catch {
      // Can't check, assume not configured
    }
  }

  app.commandLine.appendSwitch('--no-sandbox')
}

configureLinuxSandboxEarly()

startApp().catch((error) => {
  logger.error('Failed to bootstrap application', error)
})
