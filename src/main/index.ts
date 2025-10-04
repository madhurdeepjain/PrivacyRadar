import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDatabase } from './db'
import { runMigrations } from './db/migrate'
import { getDeviceInfo } from './utils/device-info'
import { setBestInterfaceInfo } from './utils/interface-utils'
import { NetworkAnalyzer } from './class_files/network-analyzer'
import { PacketWriter } from './class_files/packet-writer'

let analyzer: NetworkAnalyzer | null = null
let writer: PacketWriter | null = null
let snapshotInterval: NodeJS.Timeout | null = null

function setupPeriodicTasks(networkAnalyzer: NetworkAnalyzer, packetWriter: PacketWriter): void {
  snapshotInterval = setInterval(() => {
    packetWriter.writeProcConSnapshot(networkAnalyzer.getConnections())
  }, 5000) //every 5 seconds we log name + PID table
}

async function startAnalyzer(): Promise<void> {
  const deviceInfo = getDeviceInfo()
  setBestInterfaceInfo(deviceInfo)

  if (!deviceInfo.bestInterface) {
    throw new Error('No suitable network interface found')
  }

  const localIPs = deviceInfo.interfaces
    .flatMap(iface => iface.addresses)
    .filter(addr => addr && addr !== '0.0.0.0' && addr !== '::')

  const basePath = join(__dirname, '../../src')
  writer = new PacketWriter(basePath)
  
  analyzer = new NetworkAnalyzer(
    deviceInfo.bestInterface.name,
    localIPs,
    (pkt) => writer?.writePacket(pkt)
  )

  await analyzer.start()
  setupPeriodicTasks(analyzer, writer)
}

function cleanup(): void {
  if (snapshotInterval) clearInterval(snapshotInterval)
  writer?.close()
  analyzer?.stop()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.privacyradar')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Run database migrations first
  try {
    console.log('Running database migrations...')
    runMigrations()
    console.log('Migrations completed successfully')
  } catch (error) {
    console.error('Failed to run migrations:', error)
  }

  // Initialize database
  try {
    getDatabase()
    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }

  // IPC test
  //initOutputFiles()
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  ipcMain.on('ping', () => console.log('pong'))
  createWindow()
  startAnalyzer().catch(err => console.error('FATAL:', err))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  cleanup()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => cleanup())

process.on('SIGINT', () => {
  console.log('Caught interrupt signal')
  cleanup()
  app.quit()
})

process.on('SIGTERM', () => {
  console.log('Caught terminate signal')
  cleanup()
  app.quit()
})