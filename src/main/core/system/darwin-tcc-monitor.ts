import { spawn, ChildProcess, exec } from 'child_process'
import { BrowserWindow } from 'electron'
import { logger } from '@infra/logging'
import type { TCCEvent } from '@shared/interfaces/common'
import { BaseSystemMonitor } from './base-system-monitor'
import { FRIENDLY_APP_NAMES } from '@config/constants'

/**
 * ============================================================================
 * macOS TCC (Transparency, Consent, and Control) Hardware Monitor
 * ============================================================================
 *
 * This monitor detects when apps use privacy-sensitive hardware on macOS:
 * - Microphone
 * - Camera
 * - Screen Capture/Recording
 *
 * ## Detection Strategy
 *
 * We use TWO complementary detection methods:
 *
 * 1. **TCC Log Streaming** (Real-time)
 *    - Watches macOS unified logs for TCC access events
 *    - Provides real-time detection when apps REQUEST hardware access
 *    - Correlates msgID across log lines to get: service, responsible app, result
 *
 * 2. **pmset Assertions** (Polling)
 *    - Polls `pmset -g assertions` every 3 seconds
 *    - Detects apps CURRENTLY using hardware (audio-in, recording assertions)
 *    - Catches apps that started before our monitor
 *    - Verifies sessions are still active
 *
 * ## Key Concepts
 *
 * - **Responsible App**: macOS tracks which user-facing app is "responsible"
 *   for hardware access, even when a helper process makes the actual request.
 *   Example: Discord Helper requests mic, but Discord.app is "responsible".
 *
 * - **System Mediators**: Processes like coreaudiod, tccd that mediate hardware
 *   access on behalf of apps. We ignore these as the "user" of hardware.
 *
 * - **Session**: A continuous period of hardware usage by an app.
 *   We track start time, update lastSeen, and emit events on start/end.
 */

// =============================================================================
// Types
// =============================================================================

interface ActiveSession {
  event: TCCEvent
  startTime: Date
  lastSeen: Date
  verifiedByPmset: boolean
}

interface PendingTCCRequest {
  msgId: string
  service: string
  timestamp: Date
  responsibleBundleId?: string
  responsiblePath?: string
  responsiblePid?: number
}

// =============================================================================
// Constants
// =============================================================================

/** System processes that mediate hardware access - not the actual users */
const SYSTEM_MEDIATORS = new Set([
  'coreaudiod',
  'tccd',
  'replayd',
  'windowserver',
  'systemsoundserverd',
  'avconferenced',
  'appleh13camerad',
  'vdcassistant',
  'coreservicesd',
  'controlcenter',
  'applecamerad'
])

/** Bundle ID prefixes for system components */
const SYSTEM_BUNDLE_PREFIXES = [
  'com.apple.tccd',
  'com.apple.audio.',
  'com.apple.replayd',
  'com.apple.WindowServer',
  'com.apple.avfaudio',
  'com.apple.cmio'
]

// =============================================================================
// Main Monitor Class
// =============================================================================

export class TCCMonitor extends BaseSystemMonitor {
  // TCC log streaming
  private logProcess: ChildProcess | null = null
  private logBuffer = ''
  private pendingRequests = new Map<string, PendingTCCRequest>()

  // Session management
  private activeSessions = new Map<string, ActiveSession>()

  // Polling intervals
  private pmsetInterval: NodeJS.Timeout | null = null
  private sessionCheckInterval: NodeJS.Timeout | null = null
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(window: BrowserWindow) {
    super(window)
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  start(): void {
    if (this.logProcess) {
      logger.warn('TCC Monitor already running')
      return
    }

    if (process.platform !== 'darwin') {
      logger.error('TCC Monitor only works on macOS')
      return
    }

    this.isActive = true

    // Start TCC log streaming for real-time detection
    this.startTCCLogStream()

    // Immediately detect already-active hardware usage
    this.pollPmsetAssertions()

    // Set up polling intervals
    this.pmsetInterval = setInterval(() => this.pollPmsetAssertions(), 3000)
    this.sessionCheckInterval = setInterval(() => this.checkStaleSessions(), 5000)
    this.cleanupInterval = setInterval(() => this.cleanupPendingRequests(), 10000)

    logger.info('macOS Hardware Monitor started (TCC-based detection)')
  }

  stop(): void {
    // Stop TCC log stream
    if (this.logProcess) {
      this.logProcess.kill()
      this.logProcess = null
    }

    // Clear intervals
    if (this.pmsetInterval) clearInterval(this.pmsetInterval)
    if (this.sessionCheckInterval) clearInterval(this.sessionCheckInterval)
    if (this.cleanupInterval) clearInterval(this.cleanupInterval)
    this.pmsetInterval = null
    this.sessionCheckInterval = null
    this.cleanupInterval = null

    this.isActive = false

    // End all active sessions
    for (const key of this.activeSessions.keys()) {
      this.endSession(key)
    }

    this.activeSessions.clear()
    this.pendingRequests.clear()

    logger.info('macOS Hardware Monitor stopped')
  }

  getActiveSessions(): TCCEvent[] {
    const now = Date.now()
    return Array.from(this.activeSessions.values()).map((session) => ({
      ...session.event,
      duration: Math.floor((now - session.startTime.getTime()) / 1000)
    }))
  }

  // ===========================================================================
  // TCC Log Streaming (Real-time detection)
  // ===========================================================================

  private startTCCLogStream(): void {
    const predicate = 'subsystem == "com.apple.TCC" AND category == "access"'

    this.logProcess = spawn('log', ['stream', '--predicate', predicate, '--style', 'ndjson'])

    this.logProcess.stdout?.on('data', (data: Buffer) => {
      this.logBuffer += data.toString()
      this.processTCCLogBuffer()
    })

    this.logProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      if (!msg.includes('Filtering')) {
        logger.debug('TCC log stream:', msg)
      }
    })

    this.logProcess.on('close', (code) => {
      if (this.isActive) {
        logger.info(`TCC log stream closed (code ${code}), restarting...`)
        setTimeout(() => this.isActive && this.startTCCLogStream(), 1000)
      }
    })
  }

  private processTCCLogBuffer(): void {
    const lines = this.logBuffer.split('\n')
    this.logBuffer = lines.pop() || ''

    for (const line of lines) {
      if (line.trim().startsWith('{')) {
        this.parseTCCLogLine(line)
      }
    }
  }

  /**
   * Parse a TCC log line. TCC events come in multiple related lines with shared msgID:
   * - AUTHREQ_CTX: service type (Microphone, Camera, ScreenCapture)
   * - AUTHREQ_ATTRIBUTION: responsible app info
   * - AUTHREQ_RESULT: whether access was allowed
   */
  private parseTCCLogLine(line: string): void {
    try {
      const entry = JSON.parse(line)
      const message = entry.eventMessage || ''

      const msgIdMatch = message.match(/msgID=([^,\s]+)/)
      if (!msgIdMatch) return

      const msgId = msgIdMatch[1]

      if (message.includes('AUTHREQ_CTX:')) {
        this.handleTCCContext(msgId, message, entry)
      } else if (message.includes('AUTHREQ_ATTRIBUTION:')) {
        this.handleTCCAttribution(msgId, message)
      } else if (message.includes('AUTHREQ_RESULT:')) {
        this.handleTCCResult(msgId, message)
      }
    } catch {
      // Skip malformed JSON
    }
  }

  private handleTCCContext(msgId: string, message: string, entry: unknown): void {
    const serviceMatch = message.match(/service=kTCCService(\w+)/)
    if (!serviceMatch) return

    const rawService = serviceMatch[1]
    const service = this.normalizeService(rawService)
    if (!service) return

    this.pendingRequests.set(msgId, {
      msgId,
      service,
      timestamp: new Date((entry as { timestamp?: string }).timestamp || Date.now())
    })
  }

  private handleTCCAttribution(msgId: string, message: string): void {
    const pending = this.pendingRequests.get(msgId)
    if (!pending) return

    // Extract responsible app from: responsible={TCCDProcess: identifier=X, pid=Y, ..., responsible_path=Z}
    const match = message.match(
      /responsible=\{TCCDProcess:\s*identifier=([^,]+),\s*pid=(\d+),.*?responsible_path=([^,}]+)/
    )

    if (match) {
      pending.responsibleBundleId = match[1].trim()
      pending.responsiblePid = parseInt(match[2])
      pending.responsiblePath = match[3].trim()
    }
  }

  private handleTCCResult(msgId: string, message: string): void {
    const pending = this.pendingRequests.get(msgId)
    this.pendingRequests.delete(msgId)

    if (!pending?.responsibleBundleId) return

    // Check if access was allowed (authValue=2)
    const authMatch = message.match(/authValue=(\d+)/)
    const allowed = authMatch ? parseInt(authMatch[1]) === 2 : false

    if (!allowed) return

    // Skip system processes
    if (this.isSystemProcess(pending.responsibleBundleId, pending.responsiblePath || '')) {
      return
    }

    // Create or update session
    this.createOrUpdateSession(
      pending.responsibleBundleId,
      pending.service,
      pending.responsiblePath || '',
      pending.responsiblePid || 0,
      false // Not verified by pmset yet
    )
  }

  private normalizeService(rawService: string): string | null {
    switch (rawService) {
      case 'Microphone':
      case 'AudioCapture':
        return 'Microphone'
      case 'Camera':
        return 'Camera'
      case 'ScreenCapture':
        return 'ScreenCapture'
      default:
        return null
    }
  }

  // ===========================================================================
  // pmset Polling (Active usage detection)
  // ===========================================================================

  /**
   * Poll pmset assertions to detect active hardware usage.
   *
   * pmset shows power assertions including:
   * - audio-in: Microphone usage (via coreaudiod, Created for PID: X)
   * - "recording" assertions: Camera usage (e.g., "Photo Booth recording")
   */
  private pollPmsetAssertions(): void {
    exec('pmset -g assertions 2>/dev/null', (error, stdout) => {
      if (error || !stdout) return

      const activeMicPids = new Set<number>()
      const activeCameraPids = new Set<number>()

      this.parsePmsetOutput(stdout, activeMicPids, activeCameraPids)

      // Update sessions based on current pmset state
      this.updateMicrophoneSessions(activeMicPids)
      this.updateCameraSessions(activeCameraPids)
    })
  }

  private parsePmsetOutput(output: string, micPids: Set<number>, cameraPids: Set<number>): void {
    const lines = output.split('\n')

    let currentOwnerPid = 0
    let currentOwnerName = ''
    let currentDurationSecs = 0
    let currentAssertionName = ''
    let createdForPid: number | null = null
    let sawResourceLine = false

    for (const line of lines) {
      // Match: pid 614(coreaudiod): [0x...] 00:05:30 Type named: "assertion name"
      const ownerMatch = line.match(
        /^\s*pid\s+(\d+)\(([^)]+)\):\s*\[[^\]]+\]\s*(\d+):(\d+):(\d+)\s+\w+\s+named:\s*"([^"]+)"/
      )

      if (ownerMatch) {
        // Process previous assertion if it had audio-in resource
        if (createdForPid !== null && sawResourceLine) {
          micPids.add(createdForPid)
          this.handleMicrophoneDetection(createdForPid)
        }

        currentOwnerPid = parseInt(ownerMatch[1])
        currentOwnerName = ownerMatch[2]
        currentDurationSecs =
          parseInt(ownerMatch[3]) * 3600 + parseInt(ownerMatch[4]) * 60 + parseInt(ownerMatch[5])
        currentAssertionName = ownerMatch[6]
        createdForPid = null
        sawResourceLine = false

        // Check for camera "recording" assertion (not audio-related)
        const nameLower = currentAssertionName.toLowerCase()
        if (nameLower.includes('recording') && !nameLower.includes('audio')) {
          // Only consider recent assertions (< 10 minutes)
          if (currentDurationSecs < 600) {
            cameraPids.add(currentOwnerPid)
            this.handleCameraDetection(currentOwnerPid, currentOwnerName)
          }
        }

        continue
      }

      // Match: Created for PID: 45896.
      const createdMatch = line.match(/Created for PID:\s*(\d+)/)
      if (createdMatch) {
        createdForPid = parseInt(createdMatch[1])
        continue
      }

      // Match: Resources: audio-in ...
      const resourceMatch = line.match(/Resources:\s*(audio-in)/)
      if (resourceMatch && createdForPid !== null) {
        sawResourceLine = true
        micPids.add(createdForPid)
        this.handleMicrophoneDetection(createdForPid)
      }
    }
  }

  private handleMicrophoneDetection(pid: number): void {
    // Check if we already have a mic session
    const existing = this.findSessionByService('Microphone')
    if (existing) {
      existing.session.lastSeen = new Date()
      existing.session.verifiedByPmset = true
      return
    }

    // Create new session
    this.createSessionFromPid(pid, 'Microphone')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleCameraDetection(pid: number, _ownerName: string): void {
    // Check if we already have a camera session
    const existing = this.findSessionByService('Camera')
    if (existing) {
      existing.session.lastSeen = new Date()
      existing.session.verifiedByPmset = true
      return
    }

    // Create new session - use the owner PID (the app itself, like Photo Booth)
    this.createSessionFromPid(pid, 'Camera')
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  private createOrUpdateSession(
    bundleId: string,
    service: string,
    path: string,
    pid: number,
    verifiedByPmset: boolean
  ): void {
    const sessionKey = `${bundleId}-${service}`

    if (this.activeSessions.has(sessionKey)) {
      const session = this.activeSessions.get(sessionKey)!
      session.lastSeen = new Date()
      if (verifiedByPmset) session.verifiedByPmset = true
      return
    }

    const appName = this.extractAppName(path)
    const displayName = this.getDisplayName(appName, bundleId)
    const now = new Date()

    const event: TCCEvent = {
      id: `${Date.now()}-${pid}-${service}`,
      timestamp: now,
      app: appName,
      appName: displayName,
      bundleId,
      path,
      service,
      allowed: true,
      authValue: 2,
      authReason: 'Active Usage',
      pid,
      userId: process.getuid?.() || 0,
      eventType: 'usage',
      sessionStart: now,
      duration: 0
    }

    this.activeSessions.set(sessionKey, {
      event,
      startTime: now,
      lastSeen: now,
      verifiedByPmset
    })

    this.sendSessionUpdate(event)
    logger.info(`Hardware usage started: ${displayName} using ${service}`)
  }

  private createSessionFromPid(pid: number, service: string): void {
    exec(`ps -p ${pid} -o args= 2>/dev/null`, (error, stdout) => {
      if (error || !stdout.trim()) return

      const fullPath = stdout.trim()
      const bundleId = this.extractBundleIdFromPath(fullPath) || `pid-${pid}`

      // Skip system processes
      if (this.isSystemProcess(bundleId, fullPath)) return

      this.createOrUpdateSession(bundleId, service, fullPath, pid, true)
    })
  }

  private findSessionByService(service: string): { key: string; session: ActiveSession } | null {
    for (const [key, session] of this.activeSessions.entries()) {
      if (session.event.service === service) {
        return { key, session }
      }
    }
    return null
  }

  private updateMicrophoneSessions(activePids: Set<number>): void {
    for (const [key, session] of this.activeSessions.entries()) {
      if (session.event.service !== 'Microphone') continue

      const isStillActive = activePids.has(session.event.pid)

      if (!isStillActive && session.verifiedByPmset) {
        // Was active via pmset, now gone - end session
        this.endSession(key)
      } else if (!isStillActive) {
        // TCC-detected, not in pmset - check staleness
        const staleMs = Date.now() - session.lastSeen.getTime()
        if (staleMs > 10000) this.endSession(key)
      }
    }
  }

  private updateCameraSessions(activePids: Set<number>): void {
    for (const [key, session] of this.activeSessions.entries()) {
      if (session.event.service !== 'Camera') continue

      const isStillActive = activePids.has(session.event.pid)

      if (isStillActive) {
        session.lastSeen = new Date()
        session.verifiedByPmset = true
      } else if (session.verifiedByPmset) {
        // Was active via pmset, now gone - end session
        this.endSession(key)
      } else {
        // TCC-detected, check staleness
        const staleMs = Date.now() - session.lastSeen.getTime()
        if (staleMs > 10000) this.endSession(key)
      }
    }
  }

  private checkStaleSessions(): void {
    const now = Date.now()

    for (const [key, session] of this.activeSessions.entries()) {
      const staleMs = now - session.lastSeen.getTime()

      // Screen capture sessions - rely on TCC logs, end after 15s inactivity
      if (session.event.service === 'ScreenCapture' && staleMs > 15000) {
        this.endSession(key)
      }

      // Also do process-alive check for camera after 8s
      if (session.event.service === 'Camera' && staleMs > 8000) {
        exec(`ps -p ${session.event.pid} -o pid= 2>/dev/null`, (error, stdout) => {
          if (error || !stdout.trim()) {
            this.endSession(key)
          }
        })
      }
    }
  }

  private endSession(sessionKey: string): void {
    const session = this.activeSessions.get(sessionKey)
    if (!session) return

    const duration = Math.floor((Date.now() - session.startTime.getTime()) / 1000)

    this.sendSessionUpdate({
      ...session.event,
      sessionEnd: new Date(),
      duration
    })

    this.activeSessions.delete(sessionKey)
    logger.info(
      `Hardware usage ended: ${session.event.appName} stopped using ${session.event.service}`
    )
  }

  private cleanupPendingRequests(): void {
    const maxAge = 30000
    const now = Date.now()

    for (const [msgId, req] of this.pendingRequests.entries()) {
      if (now - req.timestamp.getTime() > maxAge) {
        this.pendingRequests.delete(msgId)
      }
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private extractAppName(path: string): string {
    if (!path) return 'Unknown'

    // Try to extract from .app bundle
    const appMatch = path.match(/\/([^/]+)\.app/)
    if (appMatch) return appMatch[1]

    // Fallback to last path component
    return path.split('/').pop() || 'Unknown'
  }

  private extractBundleIdFromPath(path: string): string | null {
    const appMatch = path.match(/\/([^/]+)\.app/)
    if (appMatch) {
      return `app.${appMatch[1].toLowerCase().replace(/\s+/g, '-')}`
    }
    return null
  }

  private getDisplayName(appName: string, bundleId: string): string {
    const lowerName = appName.toLowerCase()
    const lowerBundleId = bundleId.toLowerCase()

    // Check known mappings
    for (const [key, displayName] of Object.entries(FRIENDLY_APP_NAMES)) {
      if (lowerName.includes(key) || lowerBundleId.includes(key)) {
        return displayName
      }
    }

    // Common bundle ID patterns
    if (lowerBundleId.includes('discord')) return 'Discord'
    if (lowerBundleId.includes('slack')) return 'Slack'
    if (lowerBundleId.includes('zoom')) return 'Zoom'
    if (lowerBundleId.includes('teams')) return 'Microsoft Teams'
    if (lowerBundleId.includes('facetime')) return 'FaceTime'

    // Clean up name
    return (
      appName
        .replace(/Helper.*$/i, '')
        .replace(/Agent$/i, '')
        .replace(/-/g, ' ')
        .trim() || appName
    )
  }

  private isSystemProcess(bundleId: string, path: string): boolean {
    const lowerBundleId = bundleId.toLowerCase()
    const lowerPath = path.toLowerCase()

    // Check bundle ID prefixes
    for (const prefix of SYSTEM_BUNDLE_PREFIXES) {
      if (lowerBundleId.startsWith(prefix)) return true
    }

    // Check for system mediators in path
    for (const mediator of SYSTEM_MEDIATORS) {
      if (lowerPath.includes(mediator)) return true
    }

    // /System/Applications/ is for USER apps like Photo Booth, FaceTime
    if (lowerPath.includes('/system/applications/')) return false

    // Other /System/ paths are system processes
    if (lowerPath.includes('/system/library/') || lowerPath.includes('/usr/libexec/')) {
      return true
    }

    return false
  }
}
