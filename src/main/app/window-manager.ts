import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is, optimizer } from '@electron-toolkit/utils'

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    icon: join(__dirname, '../../resources/icon.ico'),
    show: false,
    autoHideMenuBar: true,
    center: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow.maximize()
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  app.setAppUserModelId('Privacy Radar')

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  optimizer.watchWindowShortcuts(mainWindow)

  return mainWindow
}
