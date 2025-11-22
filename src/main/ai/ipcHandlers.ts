import { ipcMain } from 'electron'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

function formatRate(bytesPerSecond: number | undefined): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '0 B/s'
  return `${formatBytes(bytesPerSecond)}/s`
}
export function registerAiHandlers() {
  const apiKey = process.env.GOOGLE_API_KEY
  console.log('[AI] GOOGLE_API_KEY present in main?', !!apiKey)

  const llm = apiKey
    ? new ChatGoogleGenerativeAI({
        apiKey,
        model: 'gemini-2.5-pro',
        temperature: 0.4
      })
    : null

  ipcMain.handle('ai:explain-session', async (_event, payload) => {
    const { summary, topApps } = payload
    const safeTopApps = Array.isArray(topApps) ? topApps.slice(0, 10) : []
    console.log('[AI] explain-session called', {
      hasLlm: !!llm,
      hasKey: !!apiKey,
      hasSummary: !!summary,
      hasTopApps: Array.isArray(topApps)
    })

    // If no key / LLM, tell renderer to fall back to local summary
    if (!llm || !apiKey) {
      console.log('[AI] Missing key or LLM, falling back to local summary')
      return ''
    }

    const prompt = `
You are a careful, privacy-focused network analyst.
Explain this capture to a non-technical laptop user in a calm, concise way.

Goals:
- Describe what is happening on the network right now.
- Highlight only the most relevant apps and traffic patterns.
- Call out any privacy-relevant behaviors (sync services, background updaters, browsers, unknown apps).
- Avoid technical jargon unless necessary, and immediately translate it into plain language.
- Keep the answer under 8 short paragraphs total.

Capture summary (pre-processed, do not repeat numbers verbatim, summarize them):
- Total data observed this session: ${formatBytes(summary.totalBytes)}
- Number of distinct apps that sent/received data: ${summary.uniqueApps}
- Approximate data rate: ${formatRate(summary.bytesPerSecond)}

Top apps in this capture (ordered by total bytes, at most 10 shown):
${safeTopApps
  .map(
    (a: any, i: number) =>
      `${i + 1}. name=${a.name}, pid=${a.pid ?? 'N/A'}, packets=${a.packetCount}, bytes=${formatBytes(a.totalBytes)}, lastSeen=${a.lastSeen}`
  )
  .join('\n')}

When you answer, follow this structure, using plain text (no markdown, no bullet characters):
1) Brief overview (1–2 sentences) of how busy the network is and what type of activity this looks like (for example: light background sync, heavy browsing, software updates).
2) App activity (3–5 short sentences) explaining which apps are most active and why they might be sending data.
3) Privacy notes (2–4 short sentences) explaining anything that could matter for privacy: unknown apps, constant upload patterns, cloud backup, browser activity, or anything that stands out.
4) Simple suggestion (1–2 sentences) on what the user could do if they are concerned, like closing a specific app, pausing sync, or checking privacy settings.

Do not invent apps that are not in the list. If something is labelled UNKNOWN, explain what that usually means instead of guessing.
`.trim()
    try {
      // we bailed out above if llm or apiKey were missing
      const model = llm!
      const response = await model.invoke(prompt)

      let text: string
      if (typeof response === 'string') {
        text = response
      } else if (Array.isArray((response as any).content)) {
        // ChatGoogleGenerativeAI returns a ChatMessage-like object
        text = (response as any).content
          .map((c: any) => (typeof c === 'string' ? c : (c?.text ?? '')))
          .join(' ')
      } else {
        text = ((response as any).content ?? '').toString()
      }

      text = text.trim()
      return text || ''
    } catch (err) {
      console.error('Gemini (LangChain) error in ai:explain-session', err)
      return '' // renderer will use local summary
    }
  })

  // …any other AI handlers you already have
}
