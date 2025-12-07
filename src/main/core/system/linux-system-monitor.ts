import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import { existsSync, readdirSync, readlinkSync } from 'fs'
import { BrowserWindow } from 'electron'
import { logger } from '@infra/logging'
import type { TCCEvent } from '@shared/interfaces/common'
import { BaseSystemMonitor } from './base-system-monitor'
import { ProcessTracker } from '../network/process-tracker'

const execAsync = promisify(exec)

// System processes that should be ignored (they have permissions but aren't user apps)
// These are legitimate system services that need hardware access to function
const SYSTEM_PROCESSES = new Set([
  // Audio/Video Servers
  'pipewire', // Audio/video server (modern)
  'wireplumber', // PipeWire session manager
  'pipewire-pulse', // PulseAudio compatibility layer
  'pulseaudio', // Audio server (legacy)
  'pulse', // PulseAudio (short name)
  'jackd', // JACK Audio Connection Kit
  'jackdbus', // JACK D-Bus service
  'sndio', // Sndio sound server
  'alsa', // ALSA utilities
  'alsactl', // ALSA control daemon
  'alsamixer', // ALSA mixer (system service)
  'pavucontrol', // PulseAudio control (system service)
  'pavucontrol-qt', // PulseAudio control Qt version

  // Wayland Compositors
  'kwin_wayland', // KDE Wayland compositor
  'kwin_wayland_wr', // KDE Wayland compositor (worker)
  'kwin', // KDE window manager (X11/Wayland)
  'weston', // Reference Wayland compositor
  'sway', // i3-like Wayland compositor
  'hyprland', // Modern Wayland compositor
  'river', // Dynamic Wayland compositor
  'wayfire', // 3D Wayland compositor
  'labwc', // Wayland stacking compositor
  'wlroots', // Wayland compositor library
  'mutter', // GNOME Wayland compositor
  'gnome-shell', // GNOME compositor/shell

  // X11 Servers & Window Managers
  'xorg', // X11 server
  'Xorg', // X11 server (capitalized)
  'Xwayland', // X11 server on Wayland
  'xserver-xorg', // X11 server package name
  'i3', // i3 window manager
  'i3bar', // i3 status bar
  'dwm', // Dynamic window manager
  'awesome', // Awesome window manager
  'openbox', // Openbox window manager
  'fluxbox', // Fluxbox window manager
  'blackbox', // Blackbox window manager
  'xfwm4', // XFCE window manager
  'marco', // MATE window manager
  'metacity', // GNOME window manager (legacy)
  'compiz', // Compiz compositor
  'compton', // X11 compositor
  'picom', // Lightweight compositor

  // Desktop Environments (system components)
  'xfce4-panel', // XFCE panel
  'xfce4-session', // XFCE session manager
  'xfdesktop', // XFCE desktop
  'lxpanel', // LXDE panel
  'lxde-session', // LXDE session
  'mate-panel', // MATE panel
  'mate-session', // MATE session
  'cinnamon', // Cinnamon desktop
  'cinnamon-session', // Cinnamon session
  'budgie-panel', // Budgie panel
  'budgie-wm', // Budgie window manager
  'plasma-desktop', // KDE Plasma desktop
  'ksmserver', // KDE session manager

  // Display Managers
  'gdm', // GNOME Display Manager
  'gdm3', // GNOME Display Manager v3
  'sddm', // Simple Desktop Display Manager
  'lightdm', // Light Display Manager
  'xdm', // X Display Manager
  'lxdm', // Lightweight X Display Manager
  'wdm', // WINGs Display Manager

  // System Daemons & Services
  'systemd', // System daemon
  'systemd-logind', // Login manager
  'systemd-user', // User session manager
  'dbus', // D-Bus message bus
  'dbus-daemon', // D-Bus daemon
  'polkitd', // PolicyKit daemon
  'udisksd', // Disk manager daemon
  'networkmanager', // Network manager
  'avahi-daemon', // mDNS/DNS-SD daemon
  'cupsd', // Print daemon
  'colord', // Color management daemon

  // Media Frameworks & Utilities
  'gst-launch', // GStreamer launcher (system service)
  'gst-plugin-scanner', // GStreamer plugin scanner
  'v4l2loopback', // Virtual video loopback
  'uvcdynctrl', // UVC camera control
  'v4l2-ctl', // V4L2 control utility

  // Screen Sharing & Remote Access
  'xrdp', // Remote Desktop Protocol server
  'vino-server', // VNC server (GNOME)
  'x11vnc', // VNC server
  'krfb', // KDE remote desktop

  // Other System Services
  'at-spi-bus-launcher', // Accessibility service
  'at-spi2-registryd', // Accessibility registry
  'ibus-daemon', // Input method framework
  'fcitx', // Input method framework
  'scim', // Input method framework
  'imsettings-daemon', // Input method settings
  'evolution-alarm-notify', // Calendar alarm (GNOME)
  'tracker-miner', // File indexer (GNOME)
  'tracker-extract', // File metadata extractor
  'zeitgeist-daemon', // Activity logger

  // GNOME Settings Daemon (gsd-* services)
  'gsd-media-keys', // GNOME media keys handler
  'gsd-sound', // GNOME sound settings
  'gsd-color', // GNOME color management
  'gsd-printer', // GNOME printer service
  'gsd-sharing', // GNOME sharing service
  'gsd-smartcard', // GNOME smartcard service
  'gsd-wacom', // GNOME Wacom tablet service
  'gsd-xsettings', // GNOME X settings
  'gsd-power', // GNOME power management
  'gsd-keyboard', // GNOME keyboard service
  'gsd-mouse', // GNOME mouse service
  'gsd-housekeeping', // GNOME housekeeping
  'gsd-print-notifications', // GNOME print notifications
  'gsd-rfkill', // GNOME RF kill service
  'gsd-screensaver-proxy', // GNOME screensaver
  'gsd-a11y-settings', // GNOME accessibility
  'gsd-clipboard', // GNOME clipboard
  'gsd-datetime', // GNOME datetime
  'gsd-location', // GNOME location
  'gsd-usb-protection', // GNOME USB protection
  'gsd-wwan', // GNOME WWAN
  'gsd-wifi', // GNOME WiFi
  'gsd-account', // GNOME account service
  'gsd-disk-utility-notify', // GNOME disk utility
  'gsd-simple-media-keys', // GNOME simple media keys
  'gsd-xrandr', // GNOME display manager
  'gsd-settings', // GNOME settings daemon
  'gsd-background', // GNOME background
  'gsd-disk-utility-proxy', // GNOME disk utility proxy
  'gsd-screensaver' // GNOME screensaver
])

interface ActiveSession {
  event: TCCEvent
  startTime: Date
  lastSeen: Date
}

/**
 * Linux System Monitor
 *
 * Monitors hardware device access on Linux using direct device file checking.
 * Tracks camera, microphone, screen capture, GPU, and storage access.
 *
 * Platform: Linux only
 * Requirements: Modern Linux with lsof, PulseAudio/PipeWire support
 */
export class LinuxSystemMonitor extends BaseSystemMonitor {
  // Polling and timeout constants
  private static readonly POLL_INTERVAL_MS = 2000 // Check hardware usage every 2 seconds
  private static readonly SESSION_TIMEOUT_CHECK_MS = 5000 // Check session timeouts every 5 seconds
  private static readonly SESSION_TIMEOUT_MS = 10000 // Session timeout after 10 seconds of inactivity
  private static readonly LSOF_TIMEOUT_MS = 2000 // lsof command timeout

  private processTracker: ProcessTracker | null = null
  private activeSessions: Map<string, ActiveSession> = new Map()
  private pollInterval: NodeJS.Timeout | null = null
  private sessionCheckInterval: NodeJS.Timeout | null = null

  constructor(window: BrowserWindow, processTracker?: ProcessTracker) {
    super(window)
    // Use shared ProcessTracker if provided, otherwise create own
    this.processTracker = processTracker || new ProcessTracker()
  }

  async start(): Promise<void> {
    if (process.platform !== 'linux') {
      logger.error('Linux System Monitor is only supported on Linux')
      return
    }

    if (this.pollInterval) {
      logger.warn('Linux System Monitor already running')
      return
    }

    if (!this.processTracker) {
      logger.error('Process tracker not set for Linux System Monitor')
      return
    }

    // Start ProcessTracker polling (only if not already started by NetworkAnalyzer)
    // ProcessTracker handles multiple startPolling() calls gracefully
    try {
      await this.processTracker.startPolling()
      logger.info('Process tracker started for Linux system monitor')
    } catch (error) {
      logger.error('Failed to start process tracker:', error)
      return
    }

    this.isActive = true

    void this.scanCurrentUsage()

    this.pollInterval = setInterval(() => {
      void this.scanCurrentUsage()
    }, LinuxSystemMonitor.POLL_INTERVAL_MS)

    this.sessionCheckInterval = setInterval(() => {
      this.checkSessionTimeouts()
    }, LinuxSystemMonitor.SESSION_TIMEOUT_CHECK_MS)

    logger.info('Linux System Monitor started')
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
    // Don't stop ProcessTracker polling - NetworkAnalyzer might still be using it
    // ProcessTracker will be cleaned up when NetworkAnalyzer stops
    this.isActive = false
    this.activeSessions.clear()
    logger.info('Linux System Monitor stopped')
  }

  getActiveSessions(): TCCEvent[] {
    return Array.from(this.activeSessions.values()).map((session) => {
      const event = session.event
      const duration = Math.floor((Date.now() - session.startTime.getTime()) / 1000)
      return {
        ...event,
        duration,
        sessionStart: session.startTime,
        lastSeen: session.lastSeen
      }
    })
  }

  protected sendEvent(event: TCCEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('system-event', event)
    }
  }

  protected sendSessionUpdate(event: TCCEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('system-session-update', event)
    }
  }

  private async scanCurrentUsage(): Promise<void> {
    try {
      await Promise.all([
        this.detectCameraUsage(),
        this.detectMicrophoneUsage(),
        this.detectScreenCaptureUsage(),
        this.detectGPUUsage()
      ])
    } catch (error) {
      logger.error('Error scanning current usage:', error)
    }
  }

  private async detectCameraUsage(): Promise<void> {
    const videoDevices = this.findVideoDevices()
    for (const device of videoDevices) {
      const access = await this.checkDeviceAccess(device, 'Camera')
      if (access) {
        for (const acc of access) {
          this.reportHardwareUsage({
            service: 'Camera',
            appName: acc.procName || 'Unknown',
            displayName: acc.procName || 'Unknown',
            pid: acc.pid || 0,
            bundleId: acc.devicePath,
            devicePath: acc.devicePath,
            startTime: new Date(acc.timestamp)
          })
        }
      }
    }
  }

  private async detectMicrophoneUsage(): Promise<void> {
    if (this.hasCommand('pactl')) {
      const paAccess = await this.checkPulseAudio()
      for (const acc of paAccess) {
        this.reportHardwareUsage({
          service: 'Microphone',
          appName: acc.procName || 'Unknown',
          displayName: acc.procName || 'Unknown',
          pid: acc.pid || 0,
          bundleId: acc.devicePath,
          devicePath: acc.devicePath,
          startTime: new Date(acc.timestamp)
        })
      }
    }

    if (this.hasCommand('pw-top')) {
      const pwAccess = await this.checkPipeWire()
      for (const acc of pwAccess) {
        this.reportHardwareUsage({
          service: 'Microphone',
          appName: acc.procName || 'Unknown',
          displayName: acc.procName || 'Unknown',
          pid: acc.pid || 0,
          bundleId: acc.devicePath,
          devicePath: acc.devicePath,
          startTime: new Date(acc.timestamp)
        })
      }
    }

    const audioDevices = this.findAudioDevices()
    for (const device of audioDevices) {
      const access = await this.checkDeviceAccess(device, 'Microphone')
      if (access) {
        for (const acc of access) {
          this.reportHardwareUsage({
            service: 'Microphone',
            appName: acc.procName || 'Unknown',
            displayName: acc.procName || 'Unknown',
            pid: acc.pid || 0,
            bundleId: acc.devicePath,
            devicePath: acc.devicePath,
            startTime: new Date(acc.timestamp)
          })
        }
      }
    }
  }

  private async detectScreenCaptureUsage(): Promise<void> {
    const isWayland = Boolean(
      process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland'
    )
    const isX11 = Boolean(process.env.DISPLAY)

    if (isWayland) {
      const waylandAccess = await this.checkWaylandCapture()
      for (const acc of waylandAccess) {
        this.reportHardwareUsage({
          service: 'ScreenCapture',
          appName: acc.procName || 'Unknown',
          displayName: acc.procName || 'Unknown',
          pid: acc.pid || 0,
          bundleId: acc.devicePath,
          devicePath: acc.devicePath,
          startTime: new Date(acc.timestamp)
        })
      }
    } else if (isX11) {
      const x11Access = await this.checkX11Capture()
      for (const acc of x11Access) {
        this.reportHardwareUsage({
          service: 'ScreenCapture',
          appName: acc.procName || 'Unknown',
          displayName: acc.procName || 'Unknown',
          pid: acc.pid || 0,
          bundleId: acc.devicePath,
          devicePath: acc.devicePath,
          startTime: new Date(acc.timestamp)
        })
      }
    }
  }

  private async detectGPUUsage(): Promise<void> {
    const gpuDevices = this.findGPUDevices()
    for (const device of gpuDevices) {
      const access = await this.checkDeviceAccess(device, 'GPU')
      if (access) {
        for (const acc of access) {
          this.reportHardwareUsage({
            service: 'GPU',
            appName: acc.procName || 'Unknown',
            displayName: acc.procName || 'Unknown',
            pid: acc.pid || 0,
            bundleId: acc.devicePath,
            devicePath: acc.devicePath,
            startTime: new Date(acc.timestamp)
          })
        }
      }
    }
  }

  /**
   * Check if a process name is a system process
   * System processes are legitimate services that need hardware access but aren't user apps
   */
  private isSystemProcess(name: string): boolean {
    if (!name) return false
    const lowerName = name.toLowerCase()
    return SYSTEM_PROCESSES.has(lowerName) || SYSTEM_PROCESSES.has(name)
  }

  private reportHardwareUsage(usage: {
    service: string
    appName: string
    displayName: string
    pid: number
    bundleId: string
    devicePath: string
    startTime: Date
  }): void {
    // Filter out system processes - they're legitimate but not user-facing apps
    if (this.isSystemProcess(usage.appName) || this.isSystemProcess(usage.displayName)) {
      try {
        logger.debug(`Skipping system process: ${usage.displayName} (${usage.service})`)
      } catch {
        // Logger worker may have exited, ignore
      }
      return
    }

    const sessionKey = `${usage.appName}-${usage.service}-${usage.pid}`

    if (!this.activeSessions.has(sessionKey)) {
      const event: TCCEvent = {
        id: `${Date.now()}-${usage.pid}-${usage.service}`,
        timestamp: usage.startTime,
        app: usage.appName,
        appName: usage.displayName,
        bundleId: usage.bundleId,
        path: usage.devicePath,
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
      this.sendEvent(event)
      this.sendSessionUpdate(event)
      try {
        logger.debug(`Hardware usage detected: ${usage.displayName} using ${usage.service}`)
      } catch {
        // Logger worker may have exited, ignore
      }
    } else {
      const session = this.activeSessions.get(sessionKey)!
      session.lastSeen = new Date()
    }
  }

  private checkSessionTimeouts(): void {
    const now = Date.now()
    const timeout = LinuxSystemMonitor.SESSION_TIMEOUT_MS

    for (const [key, session] of this.activeSessions.entries()) {
      const timeSinceLastSeen = now - session.lastSeen.getTime()
      if (timeSinceLastSeen > timeout) {
        const event = { ...session.event }
        event.sessionEnd = new Date()
        event.duration = Math.floor((now - session.startTime.getTime()) / 1000)
        this.sendEvent(event)
        this.sendSessionUpdate(event)
        this.activeSessions.delete(key)
        try {
          logger.debug(`Session ended: ${event.appName} ${event.service}`)
        } catch {
          // Logger worker may have exited, ignore
        }
      }
    }
  }

  private findVideoDevices(): string[] {
    const devices: string[] = []
    for (let i = 0; i < 10; i++) {
      const device = `/dev/video${i}`
      if (existsSync(device)) {
        devices.push(device)
      }
    }
    return devices
  }

  private findAudioDevices(): string[] {
    const devices: string[] = []
    try {
      const sndDir = '/dev/snd'
      if (existsSync(sndDir)) {
        // Use readdirSync instead of shell find command to avoid shell injection risks
        const entries = readdirSync(sndDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isCharacterDevice()) {
            devices.push(`${sndDir}/${entry.name}`)
          } else if (entry.isDirectory()) {
            // Recursively check subdirectories
            try {
              const subEntries = readdirSync(`${sndDir}/${entry.name}`, { withFileTypes: true })
              for (const subEntry of subEntries) {
                if (subEntry.isCharacterDevice()) {
                  devices.push(`${sndDir}/${entry.name}/${subEntry.name}`)
                }
              }
            } catch {
              // Ignore subdirectory errors
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return devices
  }

  private findGPUDevices(): string[] {
    const devices: string[] = []
    try {
      const driDir = '/dev/dri'
      if (existsSync(driDir)) {
        // Use readdirSync instead of shell find command to avoid shell injection risks
        const entries = readdirSync(driDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isCharacterDevice()) {
            devices.push(`${driDir}/${entry.name}`)
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return devices
  }

  private async checkDeviceAccess(
    devicePath: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _deviceType: string
  ): Promise<Array<{
    procName?: string
    pid?: number
    devicePath: string
    timestamp: number
  }> | null> {
    // More restrictive validation - only allow device paths
    if (!/^\/dev\/[\w/\-.]+$/.test(devicePath) || devicePath.includes('..')) {
      logger.debug(`Invalid device path format: ${devicePath}`)
      return null
    }

    // Additional check: ensure path is absolute and doesn't contain shell metacharacters
    if (!devicePath.startsWith('/dev/') || /[;&|`$(){}[\]]/.test(devicePath)) {
      logger.debug(`Invalid device path format: ${devicePath}`)
      return null
    }

    if (this.hasCommand('lsof')) {
      try {
        const { stdout } = await execAsync(
          `lsof "${devicePath.replace(/"/g, '\\"')}" 2>/dev/null`,
          {
            timeout: LinuxSystemMonitor.LSOF_TIMEOUT_MS,
            maxBuffer: 1024 * 1024
          }
        )

        const lines = stdout.trim().split('\n').slice(1)
        if (lines.length > 0 && lines[0].trim() !== '') {
          const accesses: Array<{
            procName?: string
            pid?: number
            devicePath: string
            timestamp: number
          }> = []

          for (const line of lines) {
            const parts = line.trim().split(/\s+/)
            if (parts.length < 2) continue

            const procName = parts[0]
            const pidStr = parts[1]

            const pid = Number.parseInt(pidStr, 10)
            if (Number.isNaN(pid) || pid <= 0) continue

            const procDetails = this.processTracker?.getProcDetails(pid)
            const resolvedProcName = procDetails?.name || procName

            accesses.push({
              devicePath,
              pid,
              procName: resolvedProcName,
              timestamp: Date.now()
            })
          }

          if (accesses.length > 0) {
            return accesses
          }
        }
      } catch {
        // Fall through to /proc fallback
      }
    }

    return this.checkDeviceAccessViaProc(devicePath)
  }

  private async checkDeviceAccessViaProc(devicePath: string): Promise<Array<{
    procName?: string
    pid?: number
    devicePath: string
    timestamp: number
  }> | null> {
    const accesses: Array<{
      procName?: string
      pid?: number
      devicePath: string
      timestamp: number
    }> = []
    const seenPids = new Set<number>()

    try {
      const procDir = '/proc'
      if (!existsSync(procDir)) {
        return null
      }

      const pids = readdirSync(procDir).filter((entry) => {
        const pid = Number.parseInt(entry, 10)
        return !Number.isNaN(pid) && pid > 0
      })

      for (const pidStr of pids) {
        const pid = Number.parseInt(pidStr, 10)
        if (seenPids.has(pid)) continue

        try {
          const fdDir = `/proc/${pid}/fd`
          if (!existsSync(fdDir)) continue

          const fds = readdirSync(fdDir)
          for (const fd of fds) {
            try {
              const fdPath = `${fdDir}/${fd}`
              const linkTarget = readlinkSync(fdPath)

              if (linkTarget === devicePath || linkTarget.startsWith(devicePath)) {
                seenPids.add(pid)
                const procDetails = this.processTracker?.getProcDetails(pid)
                accesses.push({
                  devicePath,
                  pid,
                  procName: procDetails?.name || `pid-${pid}`,
                  timestamp: Date.now()
                })
                break
              }
            } catch {
              // Ignore invalid symlinks
            }
          }
        } catch {
          // Ignore processes we can't read
        }
      }

      return accesses.length > 0 ? accesses : null
    } catch {
      return null
    }
  }

  private async checkPulseAudio(): Promise<
    Array<{ procName?: string; pid?: number; devicePath: string; timestamp: number }>
  > {
    const accesses: Array<{
      procName?: string
      pid?: number
      devicePath: string
      timestamp: number
    }> = []

    try {
      const { stdout } = await execAsync('pactl list source-outputs 2>/dev/null', {
        timeout: 2000,
        maxBuffer: 1024 * 1024
      })

      if (!stdout.includes('Source Output')) {
        return accesses
      }

      const lines = stdout.split('\n')
      let currentPid: number | undefined
      let currentApp: string | undefined

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('Source Output')) {
          currentPid = undefined
          currentApp = undefined
        } else if (line.includes('application.process.id')) {
          const match = line.match(/application\.process\.id\s*=\s*"(\d+)"/)
          if (match) {
            currentPid = Number.parseInt(match[1], 10)
          }
        } else if (line.includes('application.name')) {
          const match = line.match(/application\.name\s*=\s*"([^"]+)"/)
          if (match) {
            currentApp = match[1]
          }
        }

        if (currentPid && currentApp) {
          const procDetails = this.processTracker?.getProcDetails(currentPid)
          accesses.push({
            devicePath: 'PulseAudio',
            pid: currentPid,
            procName: procDetails?.name || currentApp,
            timestamp: Date.now()
          })
          currentPid = undefined
          currentApp = undefined
        }
      }
    } catch {
      // Ignore
    }

    return accesses
  }

  private async checkPipeWire(): Promise<
    Array<{ procName?: string; pid?: number; devicePath: string; timestamp: number }>
  > {
    const accesses: Array<{
      procName?: string
      pid?: number
      devicePath: string
      timestamp: number
    }> = []

    try {
      const { stdout } = await execAsync('timeout 2 pw-top -l 1 2>/dev/null', {
        timeout: 3000,
        maxBuffer: 1024 * 1024
      })

      if (stdout.toLowerCase().includes('recording') || stdout.toLowerCase().includes('capture')) {
        accesses.push({
          devicePath: 'PipeWire',
          procName: 'PipeWire',
          timestamp: Date.now()
        })
      }
    } catch {
      // Ignore
    }

    return accesses
  }

  private async checkWaylandCapture(): Promise<
    Array<{ procName?: string; pid?: number; devicePath: string; timestamp: number }>
  > {
    const accesses: Array<{
      procName?: string
      pid?: number
      devicePath: string
      timestamp: number
    }> = []

    // Programmatically enumerate wayland/pipewire files instead of shell wildcards
    const runtimeDir = process.env.XDG_RUNTIME_DIR || '/tmp'
    const dirs = [runtimeDir, '/tmp']
    const waylandFiles: string[] = []

    for (const dir of dirs) {
      try {
        if (existsSync(dir)) {
          const entries = readdirSync(dir)
          const matches = entries
            .filter((e) => e.startsWith('wayland-') || e.startsWith('pipewire-'))
            .map((e) => `${dir}/${e}`)
          waylandFiles.push(...matches)
        }
      } catch {
        // Ignore errors reading directories
      }
    }

    // Run lsof on each file individually, aggregate results
    const seenPids = new Set<number>()

    for (const filePath of waylandFiles) {
      if (this.hasCommand('lsof')) {
        try {
          // Use shell: false and pass file path directly (no wildcards)
          const { stdout } = await execAsync(
            `lsof "${filePath.replace(/"/g, '\\"')}" 2>/dev/null`,
            {
              timeout: LinuxSystemMonitor.LSOF_TIMEOUT_MS,
              maxBuffer: 1024 * 1024
            }
          )

          const lines = stdout
            .trim()
            .split('\n')
            .filter((line) => {
              const lower = line.toLowerCase()
              return lower.includes('screencopy') || lower.includes('pipewire')
            })

          for (const line of lines) {
            const parts = line.trim().split(/\s+/)
            if (parts.length < 2) continue

            const procName = parts[0]
            const pidStr = parts[1]
            const pid = Number.parseInt(pidStr, 10)

            if (!Number.isNaN(pid) && pid > 0 && !seenPids.has(pid)) {
              seenPids.add(pid)
              const procDetails = this.processTracker?.getProcDetails(pid)
              accesses.push({
                devicePath: 'Wayland',
                pid,
                procName: procDetails?.name || procName,
                timestamp: Date.now()
              })
            }
          }
        } catch {
          // Ignore errors for individual files
        }
      }
    }

    // Also check via /proc fallback
    for (const filePath of waylandFiles) {
      const procAccess = await this.checkDeviceAccessViaProc(filePath)
      if (procAccess) {
        for (const acc of procAccess) {
          if (acc.pid && !seenPids.has(acc.pid)) {
            seenPids.add(acc.pid)
            accesses.push(acc)
          }
        }
      }
    }

    return accesses
  }

  private async checkX11Capture(): Promise<
    Array<{ procName?: string; pid?: number; devicePath: string; timestamp: number }>
  > {
    const accesses: Array<{
      procName?: string
      pid?: number
      devicePath: string
      timestamp: number
    }> = []

    try {
      const { stdout } = await execAsync('ps aux 2>/dev/null', {
        timeout: 2000,
        maxBuffer: 1024 * 1024
      })

      const capturePatterns = [
        /ffmpeg/i,
        /obs/i,
        /kazam/i,
        /simplescreenrecorder/i,
        /recordmydesktop/i,
        /gnome-screenshot/i,
        /flameshot/i,
        /scrot/i,
        /maim/i,
        /grim/i,
        /wf-recorder/i
      ]

      const lines = stdout.split('\n')
      const seenPids = new Set<number>()

      for (const line of lines) {
        if (line.includes('grep') || !line.trim()) continue

        const matchesPattern = capturePatterns.some((pattern) => pattern.test(line))
        if (!matchesPattern) continue

        const parts = line.trim().split(/\s+/)
        if (parts.length < 11) continue

        const pidStr = parts[1]
        const procName = parts[10] || parts[0]
        const pid = Number.parseInt(pidStr, 10)

        if (!Number.isNaN(pid) && pid > 0 && !seenPids.has(pid)) {
          seenPids.add(pid)
          const procDetails = this.processTracker?.getProcDetails(pid)
          accesses.push({
            devicePath: 'X11',
            pid,
            procName: procDetails?.name || procName,
            timestamp: Date.now()
          })
        }
      }
    } catch {
      // Ignore
    }

    return accesses
  }

  private hasCommand(command: string): boolean {
    if (!/^[a-zA-Z0-9_-]+$/.test(command)) {
      return false
    }

    try {
      execSync(`which ${command}`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
}
