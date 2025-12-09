import { BrowserWindow } from 'electron'
import { exec } from 'child_process'
import { logger } from '@infra/logging'
import type { TCCEvent } from '@shared/interfaces/common'
import { BaseSystemMonitor } from './base-system-monitor'
import { FRIENDLY_APP_NAMES } from '@main/config/constants'

interface ActiveSession {
  event: TCCEvent
  startTime: Date
  lastSeen: Date
}

interface HardwareUsage {
  service: string
  appName: string
  displayName: string
  pid: number
  path: string
  startTime: Date
}

const SYSTEM_PROCESSES = new Set([
  'system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'dwm.exe',
  'audiodg.exe',
  'conhost.exe',
  'fontdrvhost.exe',
  'winlogon.exe',
  'searchindexer.exe',
  'runtimebroker.exe',
  'taskhostw.exe',
  'sihost.exe',
  'ctfmon.exe',
  'explorer.exe',
  'dllhost.exe',
  'spoolsv.exe',
  'wudfhost.exe'
])

export class WindowsSystemMonitor extends BaseSystemMonitor {
  private activeSessions: Map<string, ActiveSession> = new Map()
  private sessionCheckInterval: NodeJS.Timeout | null = null
  private pollInterval: NodeJS.Timeout | null = null

  constructor(window: BrowserWindow) {
    super(window)
  }

  start(): void {
    if (this.pollInterval) {
      logger.warn('Windows System Monitor already running')
      return
    }

    if (process.platform !== 'win32') {
      logger.error('System Monitor is only supported on Windows')
      return
    }

    this.isActive = true
    this.scanCurrentUsage()

    //Poll every 3 seconds
    this.pollInterval = setInterval(() => {
      this.scanCurrentUsage()
    }, 3000)

    this.sessionCheckInterval = setInterval(() => {
      this.checkSessionTimeouts()
    }, 5000)

    logger.info('Windows Hardware Monitor started')
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }
    this.isActive = false
    this.activeSessions.clear()
    logger.info('Windows Hardware Monitor stopped')
  }

  private async scanCurrentUsage(): Promise<void> {
    try {
      await Promise.all([this.detectCameraUsage(), this.detectMicrophoneUsage()])
    } catch (error) {
      logger.error('Error scanning current usage:', error)
    }
  }

  private async detectCameraUsage(): Promise<void> {
    return new Promise((resolve) => {
      const script = `Get-ChildItem "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam" -Recurse | Get-ItemProperty | Where-Object { $_.LastUsedTimeStop -eq 0 -or $_.LastUsedTimeStop -lt $_.LastUsedTimeStart } | Select-Object PSChildName | ConvertTo-Json`

      exec(`powershell -Command "${script}"`, { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve()
          return
        }

        try {
          const results = JSON.parse(stdout)
          const appList = Array.isArray(results) ? results : [results]

          for (const app of appList) {
            if (!app.PSChildName) continue
            const appPath = app.PSChildName.replace(/#/g, '\\')
            if (appPath === 'NonPackagedApps') continue
            this.getProcessInfoByPath(appPath, 'Camera')
          }
        } catch (parseError) {
          logger.debug('Error parsing camera registry:', parseError)
        }
        resolve()
      })
    })
  }

  private async detectMicrophoneUsage(): Promise<void> {
    return new Promise((resolve) => {
      const script = `Get-ChildItem "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone" -Recurse | Get-ItemProperty | Where-Object { $_.LastUsedTimeStop -eq 0 -or $_.LastUsedTimeStop -lt $_.LastUsedTimeStart } | Select-Object PSChildName | ConvertTo-Json`

      exec(`powershell -Command "${script}"`, { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve()
          return
        }

        try {
          const results = JSON.parse(stdout)
          const appList = Array.isArray(results) ? results : [results]

          for (const app of appList) {
            if (!app.PSChildName) continue
            const appPath = app.PSChildName.replace(/#/g, '\\')
            if (appPath === 'NonPackagedApps') continue
            this.getProcessInfoByPath(appPath, 'Microphone')
          }
        } catch (parseError) {
          logger.debug('Error parsing microphone registry:', parseError)
        }
        resolve()
      })
    })
  }

  private getProcessInfoByPath(appPath: string, service: string): void {
    const exeName = appPath.split('\\').pop()?.replace('.exe', '') || appPath
    const isUWP = appPath.includes('_8wekyb3d8bbwe') || appPath.includes('_')

    if (isUWP) {
      //Use package name as display name
      const packageName = appPath.split('_')[0].replace('Microsoft.', '')

      //UWP apps often have multiple processes
      const script = `Get-Process | Where-Object { $_.ProcessName -like '*${packageName}*' } | Select-Object -First 1 ProcessName, Id, Path | ConvertTo-Json`

      exec(`powershell -Command "${script}"`, { timeout: 3000 }, (error, stdout) => {
        if (!error && stdout.trim()) {
          try {
            const proc = JSON.parse(stdout)
            if (proc.ProcessName) {
              this.reportHardwareUsage({
                service,
                appName: proc.ProcessName,
                displayName: packageName,
                pid: proc.Id || 0,
                path: appPath,
                startTime: new Date()
              })
            }
          } catch {
            //Ignore parse errors
          }
        }
      })
    } else {
      //Find the process by executable name
      const script = `Get-Process | Where-Object { $_.Path -like '*${exeName}*' } | Select-Object -First 1 ProcessName, Id, Path | ConvertTo-Json`

      exec(`powershell -Command "${script}"`, { timeout: 3000 }, (error, stdout) => {
        if (!error && stdout.trim()) {
          try {
            const proc = JSON.parse(stdout)
            if (proc.ProcessName && proc.Id) {
              const appName = proc.ProcessName.toLowerCase()

              if (this.isSystemProcess(appName)) return

              this.reportHardwareUsage({
                service,
                appName: proc.ProcessName,
                displayName: this.getDisplayName(proc.ProcessName),
                pid: proc.Id,
                path: proc.Path || appPath,
                startTime: new Date()
              })
            }
          } catch {
            //Ignore parse errors
          }
        }
      })
    }
  }

  private isSystemProcess(name: string): boolean {
    const lowerName = name.toLowerCase()
    return SYSTEM_PROCESSES.has(lowerName)
  }

  private getDisplayName(appName: string): string {
    const displayName = appName.replace(/\.exe$/i, '')
    const lowerName = displayName.toLowerCase()
    for (const [key, value] of Object.entries(FRIENDLY_APP_NAMES)) {
      if (lowerName.includes(key)) {
        return value
      }
    }

    return displayName
      .split(/[-_\s]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  private reportHardwareUsage(usage: HardwareUsage): void {
    const sessionKey = `${usage.appName}-${usage.service}-${usage.pid}`

    if (!this.activeSessions.has(sessionKey)) {
      const event: TCCEvent = {
        id: `win-${Date.now()}-${usage.pid}-${usage.service}`,
        timestamp: usage.startTime,
        app: usage.appName,
        appName: usage.displayName,
        bundleId: usage.path,
        path: usage.path,
        service: usage.service,
        allowed: true,
        authValue: 2,
        authReason: 'Active Usage',
        pid: usage.pid,
        userId: 0, //NA to Windows
        eventType: 'usage',
        sessionStart: usage.startTime,
        duration: 0
      }

      const session: ActiveSession = {
        event,
        startTime: usage.startTime,
        lastSeen: new Date()
      }

      this.activeSessions.set(sessionKey, session)
      this.sendSessionUpdate(event)
      logger.info(`Hardware usage detected: ${usage.displayName} using ${usage.service}`)
    } else {
      const session = this.activeSessions.get(sessionKey)!
      session.lastSeen = new Date()
    }
  }

  private checkSessionTimeouts(): void {
    const now = new Date()
    const timeoutMs = 10000

    for (const [key, session] of this.activeSessions.entries()) {
      const timeSinceLastSeen = now.getTime() - session.lastSeen.getTime()

      if (timeSinceLastSeen > timeoutMs) {
        const duration = Math.floor(
          (session.lastSeen.getTime() - session.startTime.getTime()) / 1000
        )

        this.sendSessionUpdate({
          ...session.event,
          sessionStart: session.startTime,
          sessionEnd: session.lastSeen,
          duration: duration
        })

        this.activeSessions.delete(key)
        logger.info(`Hardware usage ended: ${key} (${duration}s)`)
      }
    }
  }

  getActiveSessions(): TCCEvent[] {
    return Array.from(this.activeSessions.values()).map((session) => {
      const duration = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000)
      return {
        ...session.event,
        sessionStart: session.startTime,
        duration: duration
      }
    })
  }
}
