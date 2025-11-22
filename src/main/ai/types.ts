export type FlowCategory =
  | 'telemetry'
  | 'ads_tracking'
  | 'updates'
  | 'user_content'
  | 'suspicious'
  | 'unknown'

// Per-app traffic summary for a time window.
export interface AppFlowSummary {
  appName: string
  executablePath?: string
  totalBytesSent: number
  totalBytesReceived: number
  connectionCount: number
  countries: string[] // e.g. ["US", "DE"]
  primaryDomains: string[] // e.g. ["google.com", "analytics.google.com"]
}

// Overall session summary passed into the AI.
export interface SessionSummary {
  timeWindowMinutes: number
  totalApps: number
  totalConnections: number
  totalBytesSent: number
  totalBytesReceived: number
  apps: AppFlowSummary[]
}

// AI risk view for a single app.
export interface AppRiskInsight {
  appName: string
  overallRisk: 'low' | 'medium' | 'high'
  categories: FlowCategory[]
  explanation: string
}

// AI output for the whole session, sent back to the UI.
export interface AiSessionInsight {
  narrativeSummary: string
  topRisks: AppRiskInsight[]
}
