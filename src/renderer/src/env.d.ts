/// <reference types="vite/client" />

// Extra types for the renderer window object.

interface AiSessionInsight {
  narrativeSummary: string;
  topRisks: {
    appName: string;
    overallRisk: "low" | "medium" | "high";
    categories: string[];
    explanation: string;
  }[];
}

interface Window {
  // Bridge exposed from preload.
  privacyAI?: {
    explainSession: (timeWindowMinutes?: number) => Promise<AiSessionInsight>;
  };
}
