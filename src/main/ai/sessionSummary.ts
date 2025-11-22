// Builds a compact session summary for the AI layer.
// For now this is stub data. Later we can replace it with real Drizzle queries.

import { SessionSummary } from "./types";

// Return fake data so we can test the AI pipeline.
export async function buildSessionSummary(
  timeWindowMinutes = 30
): Promise<SessionSummary> {
  return {
    timeWindowMinutes,
    totalApps: 2,
    totalConnections: 8,
    totalBytesSent: 2_500_000,
    totalBytesReceived: 6_000_000,
    apps: [
      {
        appName: "Google Chrome",
        executablePath: "/Applications/Google Chrome.app",
        totalBytesSent: 1_500_000,
        totalBytesReceived: 4_000_000,
        connectionCount: 5,
        countries: ["US", "IE"],
        primaryDomains: ["google.com", "analytics.google.com"],
      },
      {
        appName: "Visual Studio Code",
        executablePath: "/Applications/Visual Studio Code.app",
        totalBytesSent: 1_000_000,
        totalBytesReceived: 2_000_000,
        connectionCount: 3,
        countries: ["US"],
        primaryDomains: ["vscode.dev", "update.code.visualstudio.com"],
      },
    ],
  };
}
