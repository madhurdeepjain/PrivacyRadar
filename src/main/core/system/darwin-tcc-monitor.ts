import { spawn, ChildProcess, exec, execSync } from 'child_process'
import { BrowserWindow } from 'electron'
import { logger } from '@infra/logging'
import type { TCCEvent } from '@shared/interfaces/common'
import { BaseSystemMonitor } from './base-system-monitor'
import { FRIENDLY_APP_NAMES } from '@config/constants'

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
  bundleId: string
  startTime: Date
}

// System processes that should be ignored (they have permissions but aren't user apps)
const SYSTEM_PROCESSES = new Set([
  'windowserver',
  'dock',
  'finder',
  'systemuiserver',
  'loginwindow',
  'screencaptureui',
  'tccd',
  'distnoted',
  'coreaudiod',
  'audioclipd',
  'appleh13camerad',
  'mediaremoted',
  'coreservicesd',
  'controlcenter',
  'notificationcenterui',
  'airplayuiagent',
  'sharingd',
  'usernoted',
  'useractivityd',
  'corespeechd',
  'assistantd',
  'siriknowledged',
  'imagent',
  'imtransferagent',
  'callservicesd',
  'avconferenced',
  'bluetoothaudiagent',
  'universalaccessd',
  'contextstored',
  'continuitycaptureagent',
  'rapportd',
  'replayd',
  'screensharingd',
  'remotemanagementd',
  'launchservicesd',
  'powerd',
  'cfprefsd'
])

/**
 * macOS Hardware & Privacy Monitor
 *
 * Monitors actual hardware usage (camera, microphone, screen capture) on macOS.
 * Uses a focused approach that only reports genuine user-facing app usage,
 * filtering out system daemons and background processes.
 *
 * Platform: macOS (Darwin) only
 * Requirements: macOS 10.14+
 */
export class TCCMonitor extends BaseSystemMonitor {
  private logProcess: ChildProcess | null = null
  private buffer: string = ''
  private activeSessions: Map<string, ActiveSession> = new Map()
  private sessionCheckInterval: NodeJS.Timeout | null = null
  private pollInterval: NodeJS.Timeout | null = null

  constructor(window: BrowserWindow) {
    super(window)
  }

  start(): void {
    if (this.logProcess) {
      logger.warn('TCC Monitor already running')
      return
    }

    if (process.platform !== 'darwin') {
      logger.error('TCC Monitor is only supported on macOS')
      return
    }

    this.isActive = true

    // Immediately scan for current hardware usage
    this.scanCurrentUsage()

    // Start streaming logs for real-time detection
    this.startLogStream()

    // Poll for hardware usage every 3 seconds
    this.pollInterval = setInterval(() => {
      this.scanCurrentUsage()
    }, 3000)

    // Check for ended sessions every 5 seconds
    this.sessionCheckInterval = setInterval(() => {
      this.checkSessionTimeouts()
    }, 5000)

    logger.info('macOS Hardware Monitor started')
  }

  private startLogStream(): void {
    // Stream TCC events for permission requests AND actual usage indicators
    // - com.apple.TCC: permission checks (camera, microphone, screen capture)
    // - com.apple.cmio: CoreMediaIO for camera usage
    // - com.apple.coreaudio: CoreAudio for microphone usage
    const predicate = `(subsystem == "com.apple.TCC" AND category == "access") OR
                       (subsystem == "com.apple.cmio" AND (eventMessage CONTAINS "Start" OR eventMessage CONTAINS "Stop" OR eventMessage CONTAINS "client")) OR
                       (subsystem == "com.apple.coreaudio" AND (eventMessage CONTAINS "input" OR eventMessage CONTAINS "Input" OR eventMessage CONTAINS "recording" OR eventMessage CONTAINS "Recording"))`

    this.logProcess = spawn('log', ['stream', '--predicate', predicate, '--style', 'ndjson'])

    this.logProcess.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.logProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      if (!msg.includes('Filtering')) {
        logger.debug('Log stream message:', msg)
      }
    })

    this.logProcess.on('close', (code) => {
      if (this.isActive) {
        logger.info(`Log stream stopped with code ${code}, restarting...`)
        setTimeout(() => {
          if (this.isActive) {
            this.startLogStream()
          }
        }, 1000)
      }
    })
  }

  stop(): void {
    if (this.logProcess) {
      this.logProcess.kill()
      this.logProcess = null
    }
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.isActive = false
    this.activeSessions.clear()
    logger.info('macOS Hardware Monitor stopped')
  }

  /**
   * Scan for currently active camera and microphone usage
   */
  private async scanCurrentUsage(): Promise<void> {
    try {
      await Promise.all([
        this.detectCameraUsage(),
        this.detectMicrophoneUsage(),
        this.detectScreenCaptureUsage()
      ])
    } catch (error) {
      logger.error('Error scanning current usage:', error)
    }
  }

  /**
   * Detect apps currently using the camera
   * Uses the macOS camera indicator system
   */
  private async detectCameraUsage(): Promise<void> {
    return new Promise((resolve) => {
      // Check which user apps are using camera via VDC (Video Device Control)
      // This command finds processes that have the camera device open
      const cmd = `lsof 2>/dev/null | grep -E "AppleH.*Camera|VDCAssistant|CMIODaemonExtension" | awk '{print $2}' | sort -u`

      exec(cmd, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve()
          return
        }

        const pids = stdout
          .trim()
          .split('\n')
          .map((p) => parseInt(p))
          .filter((p) => !isNaN(p))

        for (const pid of pids) {
          this.getProcessInfo(pid).then((info) => {
            if (info && !this.isSystemProcess(info.name)) {
              this.reportHardwareUsage({
                service: 'Camera',
                appName: info.name,
                displayName: info.displayName,
                pid,
                bundleId: info.bundleId,
                startTime: new Date()
              })
            }
          })
        }
        resolve()
      })
    })
  }

  /**
   * Detect apps currently using the microphone
   * Uses multiple detection methods for better coverage on Intel and Apple Silicon
   */
  private async detectMicrophoneUsage(): Promise<void> {
    return new Promise((resolve) => {
      // Method 1: Check for apps with audio device file handles (works on Intel)
      const lsofCmd = `lsof 2>/dev/null | grep -E "AppleHDAEngineInput|AudioInjector|AppleUSBAudio" | awk '{print $2}' | sort -u`

      exec(lsofCmd, (error, stdout) => {
        if (!error && stdout.trim()) {
          const pids = stdout
            .trim()
            .split('\n')
            .map((p) => parseInt(p))
            .filter((p) => !isNaN(p))

          for (const pid of pids) {
            this.getProcessInfo(pid).then((info) => {
              if (info && !this.isSystemProcess(info.name)) {
                this.reportHardwareUsage({
                  service: 'Microphone',
                  appName: info.name,
                  displayName: info.displayName,
                  pid,
                  bundleId: info.bundleId,
                  startTime: new Date()
                })
              }
            })
          }
        }

        // Method 2: Check for known audio recording apps that are running
        this.detectMicrophoneViaKnownApps()
        resolve()
      })
    })
  }

  /**
   * Check for known microphone-using apps that are currently running
   */
  private detectMicrophoneViaKnownApps(): void {
    // Check for common audio recording apps
    const knownMicApps = [
      'Voice Memos',
      'VoiceMemos',
      'QuickTime Player',
      'GarageBand',
      'Logic Pro',
      'Audacity',
      'zoom.us',
      'FaceTime',
      'Discord',
      'Slack',
      'Microsoft Teams',
      'Skype'
    ]

    const pattern = knownMicApps.map((app) => app.replace(/ /g, '.')).join('|')
    const cmd = `ps aux 2>/dev/null | grep -iE "${pattern}" | grep -v grep`

    exec(cmd, (error, stdout) => {
      if (error || !stdout.trim()) return

      const lines = stdout.trim().split('\n')
      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length >= 2) {
          const pid = parseInt(parts[1])
          if (!isNaN(pid)) {
            // Check if this app is actually recording (has microphone TCC permission active)
            this.checkMicrophoneAccess(pid)
          }
        }
      }
    })
  }

  /**
   * Check if a process is actively using the microphone via TCC
   */
  private checkMicrophoneAccess(pid: number): void {
    this.getProcessInfo(pid).then((info) => {
      if (!info || this.isSystemProcess(info.name)) return

      // Check if this process has recently accessed microphone via TCC logs
      const cmd = `log show --last 30s --predicate 'subsystem == "com.apple.TCC" AND eventMessage CONTAINS "kTCCServiceMicrophone" AND eventMessage CONTAINS "${info.name}"' 2>/dev/null | head -1`

      exec(cmd, (error, stdout) => {
        if (!error && stdout.trim()) {
          this.reportHardwareUsage({
            service: 'Microphone',
            appName: info.name,
            displayName: info.displayName,
            pid,
            bundleId: info.bundleId,
            startTime: new Date()
          })
        }
      })
    })
  }

  /**
   * Detect apps actively recording/sharing the screen
   * Only detects apps that are genuinely capturing screen content
   */
  private async detectScreenCaptureUsage(): Promise<void> {
    return new Promise((resolve) => {
      // Look for known screen recording apps that are actively running
      // This is more conservative - we only report apps known to be screen recording tools
      const knownRecorders = [
        'obs',
        'OBS',
        'QuickTime Player',
        'ScreenFlow',
        'Camtasia',
        'Loom',
        'screencapture',
        'Screenshot',
        'CleanShot'
      ]

      const pattern = knownRecorders.join('|')
      const cmd = `ps aux 2>/dev/null | grep -iE "${pattern}" | grep -v grep`

      exec(cmd, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve()
          return
        }

        const lines = stdout.trim().split('\n')
        for (const line of lines) {
          const parts = line.split(/\s+/)
          if (parts.length >= 2) {
            const pid = parseInt(parts[1])
            if (!isNaN(pid)) {
              this.getProcessInfo(pid).then((info) => {
                if (info && !this.isSystemProcess(info.name)) {
                  // Verify this is actually a screen recording session
                  // QuickTime in particular might just be open without recording
                  if (this.isActivelyRecording(info.name)) {
                    this.reportHardwareUsage({
                      service: 'ScreenCapture',
                      appName: info.name,
                      displayName: info.displayName,
                      pid,
                      bundleId: info.bundleId,
                      startTime: new Date()
                    })
                  }
                }
              })
            }
          }
        }
        resolve()
      })
    })
  }

  /**
   * Check if an app is actively recording (not just open)
   */
  private isActivelyRecording(appName: string): boolean {
    const lowerName = appName.toLowerCase()

    // OBS is always recording if running in studio mode
    if (lowerName.includes('obs')) {
      return true // OBS is typically only launched for recording/streaming
    }

    // screencapture is always actively capturing
    if (lowerName === 'screencapture') {
      return true
    }

    // For other apps, we'd need more sophisticated detection
    // For now, be conservative and only report definite recorders
    return (
      lowerName.includes('loom') ||
      lowerName.includes('screenflow') ||
      lowerName.includes('camtasia')
    )
  }

  /**
   * Get full process information for a PID
   */
  private async getProcessInfo(
    pid: number
  ): Promise<{ name: string; displayName: string; bundleId: string } | null> {
    return new Promise((resolve) => {
      try {
        // Get the full command/path for the process
        const result = execSync(`ps -p ${pid} -o comm= 2>/dev/null`, { encoding: 'utf-8' }).trim()

        if (!result) {
          resolve(null)
          return
        }

        const appName = this.extractAppName(result)
        const displayName = this.getDisplayName(appName)

        // Try to get bundle ID for .app bundles
        let bundleId = appName
        const appPath = this.getAppPath(pid)
        if (appPath) {
          bundleId = appPath
        }

        resolve({ name: appName, displayName, bundleId })
      } catch {
        resolve(null)
      }
    })
  }

  /**
   * Try to get the .app bundle path for a process
   */
  private getAppPath(pid: number): string | null {
    try {
      const result = execSync(
        `lsof -p ${pid} 2>/dev/null | grep -E "\\.app/" | head -1 | awk '{print $9}'`,
        {
          encoding: 'utf-8'
        }
      ).trim()

      if (result && result.includes('.app')) {
        const appMatch = result.match(/^(.*?\.app)/)
        return appMatch ? appMatch[1] : null
      }
    } catch {
      // Ignore errors
    }
    return null
  }

  /**
   * Get a user-friendly display name for an app
   */
  private getDisplayName(appName: string): string {
    const lowerName = appName.toLowerCase()

    // Check known mappings
    for (const [key, displayName] of Object.entries(FRIENDLY_APP_NAMES)) {
      if (lowerName.includes(key)) {
        return displayName
      }
    }

    // Clean up the name for display
    return appName
      .replace(/Helper.*$/i, '')
      .replace(/Agent$/i, '')
      .replace(/Daemon$/i, '')
      .replace(/-/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .trim()
  }

  /**
   * Check if a process name is a system process
   */
  private isSystemProcess(name: string): boolean {
    const lowerName = name.toLowerCase()
    return SYSTEM_PROCESSES.has(lowerName) || (lowerName.endsWith('d') && lowerName.length < 15)
  }

  private reportHardwareUsage(usage: HardwareUsage): void {
    const sessionKey = `${usage.appName}-${usage.service}-${usage.pid}`

    if (!this.activeSessions.has(sessionKey)) {
      const event: TCCEvent = {
        id: `${Date.now()}-${usage.pid}-${usage.service}`,
        timestamp: usage.startTime,
        app: usage.appName,
        appName: usage.displayName,
        bundleId: usage.bundleId,
        path: usage.bundleId,
        service: usage.service,
        allowed: true,
        authValue: 2,
        authReason: 'Active Usage',
        pid: usage.pid,
        userId: process.getuid?.() || 0,
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

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.trim()) {
        this.parseLogEntry(line)
      }
    }
  }

  private parseLogEntry(line: string): void {
    try {
      if (!line.startsWith('{')) return

      const entry = JSON.parse(line)
      const message = entry.eventMessage || ''
      const subsystem = entry.subsystem || ''
      const processPath = entry.processImagePath || ''

      // Handle TCC permission events (for logging/history)
      if (subsystem === 'com.apple.TCC' && message.includes('kTCCService')) {
        this.handleTCCEvent(entry, message, processPath)
      }

      // Handle camera start/stop events from CoreMediaIO
      if (subsystem === 'com.apple.cmio') {
        this.handleCameraLogEvent(entry, message, processPath)
      }

      // Handle microphone events from CoreAudio
      if (subsystem === 'com.apple.coreaudio') {
        this.handleMicrophoneLogEvent(entry, message, processPath)
      }
    } catch {
      // Skip malformed lines
    }
  }

  private handleMicrophoneLogEvent(
    entry: { processID?: number; timestamp?: string },
    message: string,
    processPath: string
  ): void {
    const pid = entry.processID || 0
    if (pid === 0) return

    const appName = this.extractAppName(processPath)
    if (this.isSystemProcess(appName)) return

    const displayName = this.getDisplayName(appName)
    const lowerMessage = message.toLowerCase()

    // Check for audio input/recording indicators
    if (
      lowerMessage.includes('input') ||
      lowerMessage.includes('recording') ||
      lowerMessage.includes('capture') ||
      lowerMessage.includes('start')
    ) {
      this.reportHardwareUsage({
        service: 'Microphone',
        appName,
        displayName,
        pid,
        bundleId: processPath,
        startTime: new Date(entry.timestamp || Date.now())
      })
    }
  }

  private handleCameraLogEvent(
    entry: { processID?: number; timestamp?: string },
    message: string,
    processPath: string
  ): void {
    const pid = entry.processID || 0
    if (pid === 0) return

    const appName = this.extractAppName(processPath)
    if (this.isSystemProcess(appName)) return

    const displayName = this.getDisplayName(appName)

    if (
      message.includes('Start') ||
      message.includes('begin') ||
      message.includes('connect') ||
      message.includes('activate')
    ) {
      this.reportHardwareUsage({
        service: 'Camera',
        appName,
        displayName,
        pid,
        bundleId: processPath,
        startTime: new Date(entry.timestamp || Date.now())
      })
    } else if (
      message.includes('Stop') ||
      message.includes('disconnect') ||
      message.includes('deactivate')
    ) {
      const sessionKey = `${appName}-Camera-${pid}`
      this.endSession(sessionKey)
    }
  }

  private handleTCCEvent(
    entry: { processID?: number; userID?: number; timestamp?: string },
    message: string,
    processPath: string
  ): void {
    const appName = this.extractAppName(processPath)
    if (this.isSystemProcess(appName)) return

    const displayName = this.getDisplayName(appName)
    const service = this.extractServiceFromMessage(message)
    const pid = entry.processID || 0

    // Only track Camera, Microphone, and ScreenCapture for now
    if (!['Camera', 'Microphone', 'ScreenCapture'].includes(service)) return

    const event: TCCEvent = {
      id: `${Date.now()}-${pid}-${service}-req`,
      timestamp: new Date(entry.timestamp || Date.now()),
      app: appName,
      appName: displayName,
      bundleId: processPath,
      path: processPath,
      service,
      allowed: !message.includes('denied'),
      authValue: message.includes('denied') ? 0 : 2,
      authReason: message.includes('denied') ? 'Denied' : 'Allowed',
      pid,
      userId: entry.userID || 0,
      eventType: 'request'
    }

    this.sendEvent(event)
  }

  private extractServiceFromMessage(message: string): string {
    const serviceMap: Record<string, string> = {
      kTCCServiceCamera: 'Camera',
      kTCCServiceMicrophone: 'Microphone',
      kTCCServiceScreenCapture: 'ScreenCapture',
      kTCCServiceSystemPolicyAllFiles: 'FullDiskAccess',
      kTCCServiceAddressBook: 'Contacts',
      kTCCServiceCalendar: 'Calendar',
      kTCCServiceReminders: 'Reminders',
      kTCCServicePhotos: 'Photos',
      kTCCServiceAccessibility: 'Accessibility',
      kTCCServiceLocation: 'Location'
    }

    for (const [key, value] of Object.entries(serviceMap)) {
      if (message.includes(key)) {
        return value
      }
    }
    return 'Unknown'
  }

  private endSession(sessionKey: string): void {
    const session = this.activeSessions.get(sessionKey)
    if (session) {
      const duration = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000)

      this.sendSessionUpdate({
        ...session.event,
        sessionEnd: new Date(),
        duration
      })

      this.activeSessions.delete(sessionKey)
      logger.info(`Hardware usage ended: ${sessionKey}`)
    }
  }

  private checkSessionTimeouts(): void {
    const now = new Date()
    const timeoutMs = 10000

    for (const [key, session] of this.activeSessions.entries()) {
      const timeSinceLastSeen = now.getTime() - session.lastSeen.getTime()

      if (timeSinceLastSeen > timeoutMs) {
        this.checkProcessAlive(session.event.pid, key)
      }
    }
  }

  private checkProcessAlive(pid: number, sessionKey: string): void {
    exec(`ps -p ${pid} -o pid= 2>/dev/null`, (error, stdout) => {
      if (error || !stdout.trim()) {
        this.endSession(sessionKey)
      } else {
        const session = this.activeSessions.get(sessionKey)
        if (session) {
          session.lastSeen = new Date()
        }
      }
    })
  }

  private extractAppName(pathOrBundle: string): string {
    if (!pathOrBundle) return 'Unknown'

    // Extract app name from .app bundle path
    // e.g., "/Applications/Photo Booth.app/Contents/MacOS/Photo Booth" -> "Photo Booth"
    const appMatch = pathOrBundle.match(/\/([^/]+)\.app/)
    if (appMatch) {
      return appMatch[1]
    }

    // For bare executables, get the last component
    const parts = pathOrBundle.split('/')
    const lastPart = parts[parts.length - 1]

    if (lastPart) {
      return lastPart
    }

    return 'Unknown'
  }

  getActiveSessions(): TCCEvent[] {
    return Array.from(this.activeSessions.values()).map((session) => {
      const duration = Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000)
      return {
        ...session.event,
        sessionStart: session.startTime,
        duration
      }
    })
  }
}
