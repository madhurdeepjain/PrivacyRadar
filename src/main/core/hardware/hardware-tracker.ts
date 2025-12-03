import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, readdirSync, readlinkSync } from 'fs'
import { logger } from '@infra/logging'
import { HardwareDeviceAccess, HardwareStatus } from '@shared/interfaces/common'
import { ProcessTracker } from '../network/process-tracker'
import type { ISystemMonitor } from '../system/base-system-monitor'

const execAsync = promisify(exec)

interface DeviceAccessResult {
  procName?: string
  pid?: number
  devicePath: string
  timestamp: number
  user?: string
}

/**
 * Hardware Tracker
 *
 * Monitors hardware device access across platforms:
 * - macOS/Windows: Uses system monitoring data (TCC events)
 * - Linux: Direct device file checking
 */
export class HardwareTracker {
  private readonly processTracker: ProcessTracker
  private readonly systemMonitor: ISystemMonitor | null

  constructor(processTracker: ProcessTracker, systemMonitor: ISystemMonitor | null = null) {
    if (!processTracker) {
      throw new Error('ProcessTracker is required')
    }
    this.processTracker = processTracker
    this.systemMonitor = systemMonitor
  }

  async checkCamera(): Promise<HardwareDeviceAccess[]> {
    if (this.systemMonitor?.isRunning()) {
      return this.convertSystemEventsToHardwareAccess('Camera')
    }

    if (process.platform !== 'linux') {
      return []
    }

    return this.checkLinuxCameraDevices()
  }

  async checkMicrophone(): Promise<HardwareDeviceAccess[]> {
    if (this.systemMonitor?.isRunning()) {
      return this.convertSystemEventsToHardwareAccess('Microphone')
    }

    if (process.platform !== 'linux') {
      return []
    }

    return this.checkLinuxMicrophoneDevices()
  }

  async checkScreenCapture(): Promise<HardwareDeviceAccess[]> {
    if (this.systemMonitor?.isRunning()) {
      return this.convertSystemEventsToHardwareAccess('ScreenCapture')
    }

    if (process.platform !== 'linux') {
      return []
    }

    return this.checkLinuxScreenCapture()
  }

  async checkGPU(): Promise<HardwareDeviceAccess[]> {
    if (process.platform !== 'linux') {
      return []
    }

    try {
      const gpuDevices = this.findGPUDevices()
      const allAccesses: HardwareDeviceAccess[] = []

      for (const device of gpuDevices) {
        const access = await this.checkDeviceAccess(device, 'GPU')
        if (access) {
          allAccesses.push(...this.convertDeviceAccessToHardwareAccess(access, 'GPU', device))
        }
      }

      return allAccesses
    } catch (error) {
      logger.debug('Failed to check GPU devices:', error)
      return []
    }
  }

  async checkStorageAccess(): Promise<HardwareDeviceAccess[]> {
    if (process.platform !== 'linux') {
      return []
    }

    try {
      const sensitiveDirs = ['/home', '/root', '/etc', '/var/log']
      const allAccesses: HardwareDeviceAccess[] = []

      for (const dir of sensitiveDirs) {
        if (!existsSync(dir)) continue

        try {
          const accesses = await this.checkDirectoryAccess(dir)
          if (accesses) {
            allAccesses.push(...accesses)
          }
        } catch (error) {
          logger.debug(`Failed to check directory access: ${dir}:`, error)
        }
      }

      return allAccesses
    } catch (error) {
      logger.debug('Failed to check storage access:', error)
      return []
    }
  }

  async getHardwareStatus(): Promise<HardwareStatus> {
    const [camera, microphone, screenCapture, gpu, storage] = await Promise.all([
      this.checkCamera(),
      this.checkMicrophone(),
      this.checkScreenCapture(),
      this.checkGPU(),
      this.checkStorageAccess()
    ])

    return {
      camera,
      microphone,
      screenCapture,
      gpu,
      storage,
      timestamp: Date.now()
    }
  }

  private convertSystemEventsToHardwareAccess(service: string): HardwareDeviceAccess[] {
    if (!this.systemMonitor) {
      return []
    }

    const systemEvents = this.systemMonitor.getActiveSessions()
    const filteredEvents = systemEvents.filter(
      (e) => e.service === service && e.eventType === 'usage' && e.allowed
    )

    return filteredEvents.map((event) => ({
      device: service,
      devicePath: event.path || event.bundleId || `System ${service}`,
      pid: event.pid,
      procName: event.appName || event.app,
      user: `user${event.userId}`,
      timestamp: event.timestamp.getTime()
    }))
  }

  private async checkLinuxCameraDevices(): Promise<HardwareDeviceAccess[]> {
    try {
      const videoDevices = this.findVideoDevices()
      const allAccesses: HardwareDeviceAccess[] = []

      for (const device of videoDevices) {
        const access = await this.checkDeviceAccess(device, 'Camera')
        if (access) {
          allAccesses.push(...this.convertDeviceAccessToHardwareAccess(access, 'Camera', device))
        }
      }

      return allAccesses
    } catch (error) {
      logger.debug('Failed to check camera devices:', error)
      return []
    }
  }

  private async checkLinuxMicrophoneDevices(): Promise<HardwareDeviceAccess[]> {
    try {
      const allAccesses: HardwareDeviceAccess[] = []

      if (this.hasCommand('pactl')) {
        const paAccess = await this.checkPulseAudio()
        allAccesses.push(
          ...this.convertDeviceAccessToHardwareAccess(paAccess, 'Microphone', 'PulseAudio')
        )
      }

      if (this.hasCommand('pw-top')) {
        const pwAccess = await this.checkPipeWire()
        allAccesses.push(
          ...this.convertDeviceAccessToHardwareAccess(pwAccess, 'Microphone', 'PipeWire')
        )
      }

      const alsaAccess = await this.checkALSA()
      allAccesses.push(
        ...this.convertDeviceAccessToHardwareAccess(alsaAccess, 'Microphone', 'ALSA')
      )

      const audioDevices = this.findAudioDevices()
      for (const device of audioDevices) {
        const access = await this.checkDeviceAccess(device, 'Microphone')
        if (access) {
          allAccesses.push(
            ...this.convertDeviceAccessToHardwareAccess(access, 'Microphone', device)
          )
        }
      }

      return allAccesses
    } catch (error) {
      logger.debug('Failed to check microphone devices:', error)
      return []
    }
  }

  private async checkALSA(): Promise<DeviceAccessResult[]> {
    const accesses: DeviceAccessResult[] = []

    try {
      const asoundDir = '/proc/asound'
      if (!existsSync(asoundDir)) {
        return accesses
      }

      const cards = readdirSync(asoundDir).filter((entry) => {
        return entry.startsWith('card') && existsSync(`${asoundDir}/${entry}`)
      })

      for (const card of cards) {
        const cardPath = `${asoundDir}/${card}`
        try {
          const subdirs = readdirSync(cardPath)
          for (const subdir of subdirs) {
            if (subdir === 'pcm' || subdir === 'stream0') {
              const streamPath = `${cardPath}/${subdir}`
              if (existsSync(streamPath)) {
                const deviceAccess = await this.checkDeviceAccess(`/dev/snd/${card}`, 'Microphone')
                if (deviceAccess) {
                  accesses.push(...deviceAccess)
                }
              }
            }
          }
        } catch {
          // Ignore
        }
      }

      const alsaDevices = this.findAudioDevices()
      for (const device of alsaDevices) {
        if (device.includes('pcm') || device.includes('control')) {
          const deviceAccess = await this.checkDeviceAccess(device, 'Microphone')
          if (deviceAccess) {
            accesses.push(...deviceAccess)
          }
        }
      }
    } catch {
      // Ignore
    }

    return accesses
  }

  private async checkLinuxScreenCapture(): Promise<HardwareDeviceAccess[]> {
    try {
      const isWayland = Boolean(
        process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland'
      )
      const isX11 = Boolean(process.env.DISPLAY)

      if (isWayland) {
        const waylandAccess = await this.checkWaylandCapture()
        return this.convertDeviceAccessToHardwareAccess(waylandAccess, 'Screen Capture', 'Wayland')
      } else if (isX11) {
        const x11Access = await this.checkX11Capture()
        return this.convertDeviceAccessToHardwareAccess(x11Access, 'Screen Capture', 'X11')
      }

      return []
    } catch (error) {
      logger.debug('Failed to check screen capture:', error)
      return []
    }
  }

  private convertDeviceAccessToHardwareAccess(
    accesses: DeviceAccessResult[],
    deviceType: string,
    devicePath: string
  ): HardwareDeviceAccess[] {
    return accesses.map((acc) => ({
      device: deviceType,
      devicePath,
      pid: acc.pid,
      procName: acc.procName,
      user: acc.user,
      timestamp: acc.timestamp
    }))
  }

  private async checkDeviceAccess(
    devicePath: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _deviceType: string
  ): Promise<DeviceAccessResult[] | null> {
    if (!/^\/dev\/[\w/\-.]+$/.test(devicePath)) {
      logger.debug(`Invalid device path format: ${devicePath}`)
      return null
    }

    if (this.hasCommand('lsof')) {
      try {
        const { stdout } = await execAsync(
          `lsof "${devicePath.replace(/"/g, '\\"')}" 2>/dev/null`,
          {
            timeout: 2000,
            maxBuffer: 1024 * 1024
          }
        )

        const lines = stdout.trim().split('\n').slice(1)
        if (lines.length > 0 && lines[0].trim() !== '') {
          const accesses: DeviceAccessResult[] = []

          for (const line of lines) {
            const parts = line.trim().split(/\s+/)
            if (parts.length < 2) continue

            const procName = parts[0]
            const pidStr = parts[1]
            const user = parts[2] || 'unknown'

            const pid = Number.parseInt(pidStr, 10)
            if (Number.isNaN(pid) || pid <= 0) continue

            const procDetails = this.processTracker.getProcDetails(pid)
            const resolvedProcName = procDetails?.name || procName

            accesses.push({
              devicePath,
              pid,
              procName: resolvedProcName,
              user,
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

  private async checkDeviceAccessViaProc(devicePath: string): Promise<DeviceAccessResult[] | null> {
    const accesses: DeviceAccessResult[] = []
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
                const procDetails = this.processTracker.getProcDetails(pid)
                const statPath = `/proc/${pid}/stat`
                let user = 'unknown'

                try {
                  if (existsSync(statPath)) {
                    const stat = execSync(`stat -c %U "${statPath}" 2>/dev/null`, {
                      encoding: 'utf8'
                    }).trim()
                    if (stat) user = stat
                  }
                } catch {
                  // Ignore
                }

                accesses.push({
                  devicePath,
                  pid,
                  procName: procDetails?.name || `pid-${pid}`,
                  user,
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

  private async checkDirectoryAccess(dir: string): Promise<HardwareDeviceAccess[] | null> {
    // More restrictive validation
    if (!/^\/[\w/\-.]+$/.test(dir) || dir.includes('..') || /[;&|`$(){}[\]]/.test(dir)) {
      logger.debug(`Invalid directory path format: ${dir}`)
      return null
    }

    // Ensure it's an absolute path
    if (!dir.startsWith('/')) {
      logger.debug(`Directory path must be absolute: ${dir}`)
      return null
    }

    if (this.hasCommand('lsof')) {
      try {
        // Remove shell pipe and filter in JavaScript to avoid type issues
        // No need for shell: true since we removed the pipe
        const { stdout } = await execAsync(`lsof +D "${dir.replace(/"/g, '\\"')}" 2>/dev/null`, {
          timeout: 2000,
          maxBuffer: 1024 * 1024
        })

        // Filter in JavaScript instead of using shell pipes
        const lines = stdout.trim().split('\n').slice(1).slice(0, 10)
        if (lines.length > 0 && lines[0].trim() !== '') {
          const accesses: HardwareDeviceAccess[] = []

          for (const line of lines) {
            const parts = line.trim().split(/\s+/)
            if (parts.length < 2) continue

            const procName = parts[0]
            const pidStr = parts[1]
            const user = parts[2] || 'unknown'

            const pid = Number.parseInt(pidStr, 10)
            if (Number.isNaN(pid) || pid <= 0) continue

            const procDetails = this.processTracker.getProcDetails(pid)
            const resolvedProcName = procDetails?.name || procName

            accesses.push({
              device: 'Storage',
              devicePath: dir,
              pid,
              procName: resolvedProcName,
              user,
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

    return this.checkDirectoryAccessViaProc(dir)
  }

  private async checkDirectoryAccessViaProc(dir: string): Promise<HardwareDeviceAccess[] | null> {
    const accesses: HardwareDeviceAccess[] = []
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

              if (linkTarget.startsWith(dir)) {
                seenPids.add(pid)
                const procDetails = this.processTracker.getProcDetails(pid)
                const statPath = `/proc/${pid}/stat`
                let user = 'unknown'

                try {
                  if (existsSync(statPath)) {
                    const stat = execSync(`stat -c %U "${statPath}" 2>/dev/null`, {
                      encoding: 'utf8'
                    }).trim()
                    if (stat) user = stat
                  }
                } catch {
                  // Ignore
                }

                accesses.push({
                  device: 'Storage',
                  devicePath: dir,
                  pid,
                  procName: procDetails?.name || `pid-${pid}`,
                  user,
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

  private async checkPulseAudio(): Promise<DeviceAccessResult[]> {
    const accesses: DeviceAccessResult[] = []

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

      for (const line of lines) {
        if (line.includes('Source Output')) {
          currentPid = undefined
          currentApp = undefined
        } else if (line.includes('application.process.id')) {
          const match = line.match(/application\.process\.id\s*=\s*"(\d+)"/)
          if (match) {
            currentPid = Number.parseInt(match[1], 10)
            if (Number.isNaN(currentPid)) {
              currentPid = undefined
            }
          }
        } else if (line.includes('application.name')) {
          const match = line.match(/application\.name\s*=\s*"([^"]+)"/)
          if (match) {
            currentApp = match[1]
          }
        }

        if (currentPid && currentApp) {
          const procDetails = this.processTracker.getProcDetails(currentPid)
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

  private async checkPipeWire(): Promise<DeviceAccessResult[]> {
    const accesses: DeviceAccessResult[] = []

    try {
      const { stdout } = await execAsync('timeout 2 pw-top -l 1 2>/dev/null', {
        timeout: 3000,
        maxBuffer: 1024 * 1024
      })

      if (stdout.toLowerCase().includes('recording') || stdout.toLowerCase().includes('capture')) {
        const pipewireProcesses = await this.findPipeWireProcesses()
        if (pipewireProcesses.length > 0) {
          accesses.push(...pipewireProcesses)
        } else {
          accesses.push({
            devicePath: 'PipeWire',
            procName: 'PipeWire',
            timestamp: Date.now()
          })
        }
      }
    } catch {
      // Ignore
    }

    return accesses
  }

  private async findPipeWireProcesses(): Promise<DeviceAccessResult[]> {
    const processes = new Map<number, DeviceAccessResult>()

    // Programmatically enumerate pipewire files instead of shell wildcards
    const runtimeDir = process.env.XDG_RUNTIME_DIR || '/tmp'
    const dirs = [runtimeDir, '/tmp']
    const pipewireFiles: string[] = []

    for (const dir of dirs) {
      try {
        if (existsSync(dir)) {
          const entries = readdirSync(dir)
          const matches = entries.filter((e) => e.startsWith('pipewire-')).map((e) => `${dir}/${e}`)
          pipewireFiles.push(...matches)
        }
      } catch {
        // Ignore errors
      }
    }

    // Run lsof on each file individually
    for (const filePath of pipewireFiles) {
      if (this.hasCommand('lsof')) {
        try {
          const { stdout } = await execAsync(
            `lsof "${filePath.replace(/"/g, '\\"')}" 2>/dev/null`,
            {
              timeout: 2000,
              maxBuffer: 1024 * 1024
            }
          )

          const lines = stdout.trim().split('\n').slice(1)

          for (const line of lines) {
            const parts = line.trim().split(/\s+/)
            if (parts.length < 2) continue

            const pidStr = parts[1]
            const pid = Number.parseInt(pidStr, 10)
            if (Number.isNaN(pid) || pid <= 0) continue

            if (!processes.has(pid)) {
              const procDetails = this.processTracker.getProcDetails(pid)
              processes.set(pid, {
                devicePath: 'PipeWire',
                pid,
                procName: procDetails?.name || parts[0],
                timestamp: Date.now()
              })
            }
          }
        } catch {
          // Ignore errors for individual files
        }
      }
    }

    // Use /proc fallback (only once, not in a loop)
    const procAccess = await this.checkWaylandSocketsViaProc()
    for (const acc of procAccess) {
      if (acc.pid && !processes.has(acc.pid)) {
        processes.set(acc.pid, {
          devicePath: 'PipeWire',
          pid: acc.pid,
          procName: acc.procName,
          timestamp: acc.timestamp
        })
      }
    }

    return Array.from(processes.values())
  }

  private async checkWaylandCapture(): Promise<DeviceAccessResult[]> {
    const accesses: DeviceAccessResult[] = []

    // Programmatically enumerate wayland files
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
        // Ignore errors
      }
    }

    // Run lsof on each file individually
    const seenPids = new Set<number>()

    for (const filePath of waylandFiles) {
      if (this.hasCommand('lsof')) {
        try {
          const { stdout } = await execAsync(
            `lsof "${filePath.replace(/"/g, '\\"')}" 2>/dev/null`,
            {
              timeout: 2000,
              maxBuffer: 1024 * 1024
            }
          )

          const lines = stdout
            .trim()
            .split('\n')
            .filter((line) => {
              const lower = line.toLowerCase()
              return (
                lower.includes('screencopy') ||
                lower.includes('pipewire') ||
                lower.includes('wayland')
              )
            })

          for (const line of lines) {
            const parts = line.trim().split(/\s+/)
            if (parts.length < 2) continue

            const pidStr = parts[1]
            const pid = Number.parseInt(pidStr, 10)

            if (!Number.isNaN(pid) && pid > 0 && !seenPids.has(pid)) {
              seenPids.add(pid)
              const procDetails = this.processTracker.getProcDetails(pid)
              accesses.push({
                devicePath: 'Wayland',
                pid,
                procName: procDetails?.name || parts[0],
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
    const waylandSockets = await this.checkWaylandSocketsViaProc()
    for (const acc of waylandSockets) {
      if (acc.pid && !seenPids.has(acc.pid)) {
        seenPids.add(acc.pid)
        accesses.push(acc)
      }
    }

    // Check D-Bus screen capture
    const dbusAccess = await this.checkDbusScreenCapture()
    accesses.push(...dbusAccess)

    return accesses
  }

  private async checkWaylandSocketsViaProc(): Promise<DeviceAccessResult[]> {
    const accesses: DeviceAccessResult[] = []

    try {
      const runtimeDir = process.env.XDG_RUNTIME_DIR || '/tmp'
      const dirs = [runtimeDir, '/tmp']

      for (const dir of dirs) {
        if (!existsSync(dir)) continue

        try {
          const entries = readdirSync(dir)
          const waylandFiles = entries.filter(
            (e) => e.startsWith('wayland-') || e.startsWith('pipewire-')
          )

          for (const file of waylandFiles) {
            const filePath = `${dir}/${file}`
            const deviceAccess = await this.checkDeviceAccessViaProc(filePath)
            if (deviceAccess) {
              accesses.push(...deviceAccess)
            }
          }
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }

    return accesses
  }

  private async checkDbusScreenCapture(): Promise<DeviceAccessResult[]> {
    const accesses: DeviceAccessResult[] = []

    if (!this.hasCommand('dbus-monitor')) {
      return accesses
    }

    try {
      const { stdout } = await execAsync(
        'timeout 1 dbus-monitor --system "interface=\'org.freedesktop.portal.ScreenCast\'" 2>/dev/null',
        {
          timeout: 2000,
          maxBuffer: 1024 * 1024
        }
      )

      if (stdout.includes('ScreenCast') || stdout.includes('screencast')) {
        const psOutput = await execAsync('ps aux 2>/dev/null', {
          timeout: 2000,
          maxBuffer: 1024 * 1024
        })

        const lines = psOutput.stdout.split('\n')
        for (const line of lines) {
          if (line.includes('dbus') || line.includes('portal') || line.includes('screencast')) {
            const parts = line.trim().split(/\s+/)
            if (parts.length >= 2) {
              const pid = Number.parseInt(parts[1], 10)
              if (!Number.isNaN(pid) && pid > 0) {
                const procDetails = this.processTracker.getProcDetails(pid)
                accesses.push({
                  devicePath: 'Wayland',
                  pid,
                  procName: procDetails?.name || parts[10] || parts[0],
                  timestamp: Date.now()
                })
              }
            }
          }
        }
      }
    } catch {
      // Ignore
    }

    return accesses
  }

  private async checkX11Capture(): Promise<DeviceAccessResult[]> {
    const accesses: DeviceAccessResult[] = []

    const desktopEnv = this.detectDesktopEnvironment()
    const capturePatterns = this.getCapturePatternsForDE(desktopEnv)

    try {
      const { stdout } = await execAsync('ps aux 2>/dev/null', {
        timeout: 2000,
        maxBuffer: 1024 * 1024
      })

      const lines = stdout.split('\n')
      const seenPids = new Set<number>()

      for (const line of lines) {
        if (line.includes('grep') || !line.trim()) continue

        const matchesPattern = capturePatterns.some((pattern) => pattern.test(line))
        if (!matchesPattern) continue

        const parts = line.trim().split(/\s+/)
        if (parts.length < 11) continue

        const pidStr = parts[1]
        const pid = Number.parseInt(pidStr, 10)

        if (!Number.isNaN(pid) && pid > 0 && !seenPids.has(pid)) {
          seenPids.add(pid)
          const procName = parts[10] || parts[0]
          const procDetails = this.processTracker.getProcDetails(pid)
          accesses.push({
            devicePath: 'X11',
            pid,
            procName: procDetails?.name || procName,
            timestamp: Date.now()
          })
        }
      }

      const x11Connections = await this.checkX11Connections()
      for (const conn of x11Connections) {
        if (conn.pid && !seenPids.has(conn.pid)) {
          accesses.push(conn)
        }
      }
    } catch {
      // Ignore
    }

    return accesses
  }

  private detectDesktopEnvironment(): string {
    const xdgDesktop = process.env.XDG_CURRENT_DESKTOP || ''
    const desktop = process.env.DESKTOP_SESSION || ''
    const session = process.env.SESSION_MANAGER || ''

    if (xdgDesktop.toLowerCase().includes('gnome') || desktop.toLowerCase().includes('gnome')) {
      return 'gnome'
    }
    if (xdgDesktop.toLowerCase().includes('kde') || desktop.toLowerCase().includes('kde')) {
      return 'kde'
    }
    if (xdgDesktop.toLowerCase().includes('xfce') || desktop.toLowerCase().includes('xfce')) {
      return 'xfce'
    }
    if (xdgDesktop.toLowerCase().includes('mate') || desktop.toLowerCase().includes('mate')) {
      return 'mate'
    }
    if (
      xdgDesktop.toLowerCase().includes('cinnamon') ||
      desktop.toLowerCase().includes('cinnamon')
    ) {
      return 'cinnamon'
    }
    if (session.toLowerCase().includes('lxde') || desktop.toLowerCase().includes('lxde')) {
      return 'lxde'
    }

    return 'unknown'
  }

  private getCapturePatternsForDE(desktopEnv: string): RegExp[] {
    const basePatterns = [
      /ffmpeg/i,
      /obs/i,
      /kazam/i,
      /simplescreenrecorder/i,
      /recordmydesktop/i,
      /flameshot/i,
      /scrot/i,
      /maim/i,
      /grim/i,
      /wf-recorder/i,
      /vokoscreen/i,
      /peek/i
    ]

    const deSpecificPatterns: Record<string, RegExp[]> = {
      gnome: [/gnome-screenshot/i, /gnome-screencast/i, /org\.gnome\./i],
      kde: [/spectacle/i, /org\.kde\./i, /kde/i],
      xfce: [/xfce4-screenshooter/i, /xfce/i],
      mate: [/mate-screenshot/i, /mate/i],
      cinnamon: [/cinnamon-screenshot/i, /cinnamon/i],
      lxde: [/lxde/i]
    }

    return [...basePatterns, ...(deSpecificPatterns[desktopEnv] || [])]
  }

  private async checkX11Connections(): Promise<DeviceAccessResult[]> {
    const accesses: DeviceAccessResult[] = []

    try {
      const x11Socket = process.env.DISPLAY
      if (!x11Socket) {
        return accesses
      }

      const x11UnixPath = '/tmp/.X11-unix'
      if (existsSync(x11UnixPath)) {
        const sockets = readdirSync(x11UnixPath).filter((s) => s.startsWith('X'))
        for (const socket of sockets) {
          const socketPath = `${x11UnixPath}/${socket}`
          const deviceAccess = await this.checkDeviceAccess(socketPath, 'Screen Capture')
          if (deviceAccess) {
            accesses.push(...deviceAccess)
          }
        }
      }

      if (this.hasCommand('xlsclients')) {
        try {
          const { stdout } = await execAsync('xlsclients -l 2>/dev/null', {
            timeout: 2000,
            maxBuffer: 1024 * 1024
          })

          const lines = stdout.split('\n')
          for (const line of lines) {
            const match = line.match(/Window\s+(\d+):\s+(\S+)/)
            if (match) {
              const appName = match[2]
              const pidMatch = line.match(/PID:\s+(\d+)/)
              if (pidMatch) {
                const pid = Number.parseInt(pidMatch[1], 10)
                if (!Number.isNaN(pid) && pid > 0) {
                  const procDetails = this.processTracker.getProcDetails(pid)
                  accesses.push({
                    devicePath: 'X11',
                    pid,
                    procName: procDetails?.name || appName,
                    timestamp: Date.now()
                  })
                }
              }
            }
          }
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }

    return accesses
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
