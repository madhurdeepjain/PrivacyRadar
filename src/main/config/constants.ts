import { app } from 'electron'
import { join } from 'path'

export const PROCESS_POLL_INTERVAL_MS = 1000
export const CONNECTION_POLL_INTERVAL_MS = 300
export const CONNECTION_SYNC_INTERVAL_MS = 1000
export const PACKET_PROCESS_INTERVAL_MS = 100
export const PROC_CON_SNAPSHOT_INTERVAL_MS = 5000
export const REGISTRY_SNAPSHOT_INTERVAL_MS = 3000
export const NETSTAT_TIMEOUT_MS = 5000
export const UDP_STALE_THRESHOLD_MS = 30_000
export const HARDWARE_POLL_INTERVAL_MS = 2000
export const DEV_DATA_PATH = join(app.getAppPath(), '.dev-data')

export const SYSTEM_PROTOCOLS = new Set(['arp', 'icmp', 'icmpv6', 'igmp', 'dhcp', 'dhcpv6'])

export const SYSTEM_PORTS = new Set([53, 67, 68, 123, 137, 138, 139, 161, 162, 514, 546, 547])

export const TCP_STATES = new Set([
  'ESTABLISHED',
  'CLOSE_WAIT',
  'FIN_WAIT1',
  'FIN_WAIT2',
  'CLOSING',
  'LAST_ACK'
])

export const FRIENDLY_APP_NAMES: Record<string, string> = {
  chrome: 'Google Chrome',
  'google chrome': 'Google Chrome',
  msedge: 'Microsoft Edge',
  edge: 'Microsoft Edge',
  'microsoft edge': 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  spotify: 'Spotify',
  discord: 'Discord',
  slack: 'Slack',
  teams: 'Microsoft Teams',
  code: 'Visual Studio Code',
  vscode: 'Visual Studio Code',
  'visual studio code': 'Visual Studio Code',
  steam: 'Steam',
  svchost: 'Windows Service Host',
  explorer: 'Windows Explorer',
  nvcontainer: 'NVIDIA Container',
  adobearm: 'Adobe Updater',
  zoom: 'Zoom',
  'zoom.us': 'Zoom',
  skype: 'Skype',
  facetime: 'FaceTime',
  'photo booth': 'Photo Booth',
  photobooth: 'Photo Booth',
  obs: 'OBS Studio',
  'obs studio': 'OBS Studio',
  quicktime: 'QuickTime Player',
  'quicktime player': 'QuickTime Player',
  safari: 'Safari',
  webex: 'Cisco Webex',
  gotomeeting: 'GoToMeeting',
  loom: 'Loom',
  screenflow: 'ScreenFlow',
  camtasia: 'Camtasia',
  cursor: 'Cursor',
  terminal: 'Terminal',
  iterm: 'iTerm2',
  iterm2: 'iTerm2',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  messages: 'Messages',
  'voice memos': 'Voice Memos',
  voicememos: 'Voice Memos',
  'voice memo': 'Voice Memos',
  garageband: 'GarageBand',
  'logic pro': 'Logic Pro',
  audacity: 'Audacity'
}
