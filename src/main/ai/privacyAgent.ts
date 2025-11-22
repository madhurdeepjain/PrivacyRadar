// Uses Gemini (via LangChain) to analyze a SessionSummary.

import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AiSessionInsight, SessionSummary } from "./types";

// Validate and harden model output.
const flowCategoryEnum = z.enum([
  "telemetry",
  "ads_tracking",
  "updates",
  "user_content",
  "suspicious",
  "unknown",
]);

const appRiskInsightSchema = z.object({
  appName: z.string(),
  overallRisk: z.enum(["low", "medium", "high"]),
  categories: z.array(flowCategoryEnum),
  explanation: z.string(),
});

const aiSessionInsightSchema = z.object({
  narrativeSummary: z.string(),
  topRisks: z.array(appRiskInsightSchema),
});

// Run the privacy analyst on a session summary.
export async function analyzeSession(
  summary: SessionSummary
): Promise<AiSessionInsight> {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-pro", 
    temperature: 0.2,
  });

  const systemPrompt = `
You are a strict, calm privacy analyst.

You receive a compact summary of recent network activity per app.
Your job:
- Explain in clear, concise language what is happening overall.
- Identify which apps have meaningful privacy exposure.
- Classify traffic for each higher-risk app into:
  telemetry, ads_tracking, updates, user_content, suspicious, unknown.
- Be conservative about calling something suspicious.
- Return ONLY JSON that matches the schema.
`;

  const userPrompt = `
Here is the session summary as JSON:

${JSON.stringify(summary, null, 2)}

Return a JSON object with:
- narrativeSummary (2–4 sentences)
- topRisks: array of { appName, overallRisk, categories, explanation }.
Return ONLY valid JSON.
`;

  const response = await model.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback on bad JSON.
    return {
      narrativeSummary:
        "The AI analyst could not produce a structured result for this session.",
      topRisks: [],
    };
  }

  const safe = aiSessionInsightSchema.parse(parsed);
  return safe;
}
