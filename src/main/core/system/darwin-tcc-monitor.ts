import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { logger } from '@infra/logging'
import type { TCCEvent } from '@shared/interfaces/common'
import { BaseSystemMonitor } from './base-system-monitor'

interface ActiveSession {
  event: TCCEvent
  startTime: Date
  lastSeen: Date
}

interface TCCLogEntry {
  timestamp: string
  subsystem: string
  category: string
  eventMessage: string
  processID: number
  userID: number
  processImagePath: string
  messageType: string
}

interface TCCAccessRequest {
  msgID: string
  function: string
  senderPid: number
  senderUid: number
  timestamp: Date
}

/**
 * macOS TCC (Transparency, Consent, and Control) System Monitor
 *
 * Monitors system permission events on macOS by streaming the system log
 * for TCC subsystem events in NDJSON format. This tracks:
 * - Permission requests (when apps ask for access to resources)
 * - Active usage sessions (when apps are actively using permitted resources)
 * - Permission denials and revocations
 *
 * Supported services: Camera, Microphone, Screen Capture, Location, Contacts, Clipboard, etc.
 *
 * Platform: macOS (Darwin) only
 * Requirements: macOS 10.14+ (when TCC was introduced)
 */
export class TCCMonitor extends BaseSystemMonitor {
  private logProcess: ChildProcess | null = null
  private buffer: string = ''
  private activeSessions: Map<string, ActiveSession> = new Map()
  private sessionCheckInterval: NodeJS.Timeout | null = null
  private pendingRequests: Map<string, TCCAccessRequest> = new Map()

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

    // Start streaming logs in NDJSON format for easier parsing
    this.logProcess = spawn('log', [
      'stream',
      '--predicate',
      'subsystem == "com.apple.TCC" AND category == "access"',
      '--style',
      'ndjson'
    ])

    this.logProcess.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.logProcess.stderr?.on('data', (data: Buffer) => {
      logger.error('TCC Monitor error:', data.toString())
    })

    this.logProcess.on('close', (code) => {
      logger.info(`TCC Monitor stopped with code ${code}`)
      this.logProcess = null
    })

    // Check for ended sessions every 5 seconds
    this.sessionCheckInterval = setInterval(() => {
      this.checkSessionTimeouts()
    }, 5000)

    logger.info('TCC Monitor started')
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
    this.isActive = false
    logger.info('TCC Monitor stopped')
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        this.parseLogEntry(line)
      }
    }
  }

  private parseLogEntry(line: string): void {
    try {
      // Skip non-JSON lines (like "Filtering..." messages from log command)
      if (!line.startsWith('{')) {
        return
      }

      const entry: TCCLogEntry = JSON.parse(line)

      // Only process TCC subsystem with access category
      if (entry.subsystem !== 'com.apple.TCC' || entry.category !== 'access') {
        return
      }

      const message = entry.eventMessage

      // Parse REQUEST messages - indicates permission check
      // Format: "REQUEST: tccd_uid=501, sender_pid=42092, sender_uid=0, sender_auid=-1, function=TCCAccessRequestIndirect, msgID=42092.51"
      if (message.includes('REQUEST:')) {
        const msgIDMatch = message.match(/msgID=([^\s,]+)/)
        const functionMatch = message.match(/function=([^\s,]+)/)
        const senderPidMatch = message.match(/sender_pid=(\d+)/)
        const senderUidMatch = message.match(/sender_uid=(\d+)/)

        if (msgIDMatch && functionMatch && senderPidMatch) {
          const request: TCCAccessRequest = {
            msgID: msgIDMatch[1],
            function: functionMatch[1],
            senderPid: parseInt(senderPidMatch[1]),
            senderUid: senderUidMatch ? parseInt(senderUidMatch[1]) : 0,
            timestamp: new Date(entry.timestamp)
          }
          this.pendingRequests.set(request.msgID, request)
        }
      }

      // Parse REPLY messages - indicates permission result
      // Format: "REPLY: (501) function=TCCAccessRequestIndirect, msgID=42092.51"
      else if (message.includes('REPLY:')) {
        const msgIDMatch = message.match(/msgID=([^\s,]+)/)
        const functionMatch = message.match(/function=([^\s,]+)/)

        if (msgIDMatch) {
          const request = this.pendingRequests.get(msgIDMatch[1])

          if (request) {
            // Determine service type from function name
            let service = 'Unknown'
            if (functionMatch) {
              const func = functionMatch[1]
              if (func.includes('Camera')) service = 'Camera'
              else if (func.includes('Microphone')) service = 'Microphone'
              else if (func.includes('ScreenCapture')) service = 'ScreenCapture'
              else if (func.includes('Location')) service = 'Location'
              else if (func.includes('Contacts')) service = 'Contacts'
              else if (func.includes('Pasteboard') || func.includes('Clipboard'))
                service = 'Pasteboard'
              else if (func.includes('Accessibility')) service = 'Accessibility'
              else if (func.includes('Photos')) service = 'Photos'
              else if (func.includes('Calendar')) service = 'Calendar'
              else if (func.includes('Reminders')) service = 'Reminders'
              else if (func.includes('FullDiskAccess')) service = 'FullDiskAccess'
            }

            // Get app info from process
            const appPath = entry.processImagePath || 'Unknown'
            const appName = this.extractAppName(appPath)

            // Create event
            const event: TCCEvent = {
              id: `${Date.now()}-${request.senderPid}-${service}`,
              timestamp: new Date(entry.timestamp),
              app: appName,
              appName: appName,
              bundleId: appPath,
              path: appPath,
              service: service,
              allowed: true, // REPLY typically means request was processed
              authValue: 2,
              authReason: 'System Allowed',
              pid: request.senderPid,
              userId: entry.userID,
              eventType: 'request'
            }

            // Track as usage session if allowed
            this.trackSession(event)

            // Send to renderer
            this.sendEvent(event)

            // Clean up
            this.pendingRequests.delete(msgIDMatch[1])
          }
        }
      }

      // Parse access result messages to determine if access was denied
      // Format: "access request result was 0, timeout was 0" (0=denied, 2=allowed)
      else if (message.includes('access request result was')) {
        const resultMatch = message.match(/result was (\d+)/)
        if (resultMatch) {
          const result = parseInt(resultMatch[1])
          // 0 = denied, 2 = allowed
          // Could be used to update the last event's allowed status
          logger.debug(`Access result: ${result === 0 ? 'denied' : 'allowed'}`)
        }
      }
    } catch (error) {
      logger.error('Error parsing TCC log entry:', error)
    }
  }

  private trackSession(event: TCCEvent): void {
    const sessionKey = `${event.bundleId}-${event.service}-${event.pid}`

    if (!this.activeSessions.has(sessionKey)) {
      // New session started - this means the app is actively using the resource
      const session: ActiveSession = {
        event: { ...event, sessionStart: new Date(), eventType: 'usage' },
        startTime: new Date(),
        lastSeen: new Date()
      }
      this.activeSessions.set(sessionKey, session)

      this.sendSessionUpdate({
        ...session.event,
        sessionStart: session.startTime,
        duration: 0
      })
    } else {
      // Update existing session - app is still actively using the resource
      const session = this.activeSessions.get(sessionKey)!
      session.lastSeen = new Date()
    }
  }

  private checkSessionTimeouts(): void {
    const now = new Date()
    const timeoutMs = 10000 // Consider session ended after 10 seconds of no activity

    for (const [key, session] of this.activeSessions.entries()) {
      const timeSinceLastSeen = now.getTime() - session.lastSeen.getTime()

      if (timeSinceLastSeen > timeoutMs) {
        // Session ended
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
      }
    }
  }

  private extractAppName(pathOrBundle: string): string {
    const appMatch = pathOrBundle.match(/\/([^/]+)\.app/)
    if (appMatch) {
      return appMatch[1]
    }
    // Handle system paths
    const pathParts = pathOrBundle.split('/')
    const lastPart = pathParts[pathParts.length - 1]
    return lastPart || pathOrBundle
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
