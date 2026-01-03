import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from '@infra/logging'

export type TopApp = {
  name: string
  totalBytes: number
}

export type PrivacySnapshot = {
  totalPackets: number
  totalApps: number
  topApps: TopApp[]
  // Optional: aggregate bytes across all apps
  totalBytes?: number
  // Optional: when the user wants a deep dive on a specific app
  focusAppName?: string
  focusAppBytes?: number
  // Optional: some callers send a full focusApp object instead of name/bytes
  focusApp?: {
    name?: string
    totalBytes?: number
    pid?: number | null
  } | null
  // Optional: high-level geolocation / destination information for this capture
  geoSummary?: string | null
  // Optional: bytes per country/region (e.g. { US: 12345, DE: 6789 })
  geoByCountry?: Record<string, number> | null
  // Optional: derived geolocation summary object from renderer (e.g. topCountries/totalFlows)
  geo?: {
    topCountries?: { country: string; count: number }[]
    totalFlows?: number
  } | null
}

// Local summary – used when Gemini is unavailable or fails

function buildLocalSummary(snapshot: PrivacySnapshot): string {
  const { totalApps, totalPackets, topApps } = snapshot

  const focusName = snapshot.focusAppName ?? snapshot.focusApp?.name
  const focusBytes = snapshot.focusAppBytes ?? snapshot.focusApp?.totalBytes

  const primaryApp = focusName
    ? `${focusName} (${(focusBytes ?? 0).toLocaleString()} bytes)`
    : topApps[0]
      ? `${topApps[0].name || 'Unknown'} (${topApps[0].totalBytes.toLocaleString()} bytes)`
      : 'no dominant application yet'

  const summary = `Monitoring ${totalApps} app${
    totalApps === 1 ? '' : 's'
  } with ${totalPackets.toLocaleString()} packet${
    totalPackets === 1 ? '' : 's'
  } observed so far. The highest-volume traffic currently appears to be from ${primaryApp}.`

  const keyInsightsParts: string[] = []
  keyInsightsParts.push(
    `Most of the observed traffic volume is currently associated with ${primaryApp}.`
  )
  if (totalApps > 0) {
    keyInsightsParts.push(
      `Network activity is spread across ${totalApps} app${totalApps === 1 ? '' : 's'}.`
    )
  }
  if (typeof totalPackets === 'number') {
    keyInsightsParts.push(
      `${totalPackets.toLocaleString()} packet${totalPackets === 1 ? '' : 's'} have been seen so far.`
    )
  }

  const keyInsights = keyInsightsParts.join(' ')

  return [
    `Summary: ${summary}`,
    '',
    `Key insights: ${keyInsights}`,
    '',
    'Overall risk: Low',
    '',
    'Recommended actions: If you see high-traffic apps that you do not recognise or do not need, consider closing them or limiting their background access. Avoid sharing sensitive information on untrusted networks.'
  ].join('\n')
}

function buildGeminiPrompt(snapshot: PrivacySnapshot | null | undefined): string {
  const safeSnapshot = snapshot ?? ({} as Partial<PrivacySnapshot>)
  const {
    totalApps,
    totalPackets,
    totalBytes,
    topApps,
    focusAppName,
    focusAppBytes,
    focusApp,
    geoSummary,
    geoByCountry
  } = safeSnapshot

  const effectiveFocusName = focusAppName ?? focusApp?.name
  const effectiveFocusBytes =
    typeof focusAppBytes === 'number'
      ? focusAppBytes
      : typeof focusApp?.totalBytes === 'number'
        ? focusApp.totalBytes
        : undefined

  const safeTopApps = Array.isArray(topApps) ? topApps.slice(0, 5) : []

  const topAppsText =
    safeTopApps.length > 0
      ? safeTopApps
          .map((app: TopApp, idx: number) => {
            const name = app.name ?? 'Unknown'
            const bytes = typeof app.totalBytes === 'number' ? app.totalBytes : undefined
            return `${idx + 1}. ${name}${bytes !== undefined ? ` (${bytes} bytes)` : ''}`
          })
          .join('\n')
      : 'No top apps available.'

  let destinationsText = 'No destination information available.'
  if (typeof geoSummary === 'string' && geoSummary.trim().length > 0) {
    destinationsText = geoSummary.trim()
  } else if (geoByCountry && typeof geoByCountry === 'object') {
    const entries = Object.entries(geoByCountry).filter(
      ([, value]) => typeof value === 'number' && value > 0
    )
    if (entries.length > 0) {
      // Sort by value descending (e.g. flows) and take top 3
      const topCountries = entries
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map(([country, value]) => `${country} (${(value as number).toLocaleString()} flows)`)
      destinationsText = `Most traffic appears to be going to: ${topCountries.join(', ')}.`
    }
  }

  const baseContext = `Session stats:
- Total apps observed: ${totalApps ?? 'unknown'}
- Total packets: ${totalPackets ?? 'unknown'}
- Total bytes: ${totalBytes ?? 'unknown'}

Top apps:
${topAppsText}

Data destinations:
${destinationsText}
`

  if (effectiveFocusName) {
    return `
You are PrivacyAI, a concise desktop network privacy assistant.

You are analysing ONE specific application on a user's machine.

Application of interest:
- Name: ${String(effectiveFocusName)}
- Observed bytes: ${typeof effectiveFocusBytes === 'number' ? effectiveFocusBytes : 'unknown'}

Overall capture context:
${baseContext}

Rules:
1) Focus your explanation on the selected application above. You may briefly compare it to other apps only for context.
2) Always answer using EXACTLY these four sections, in this order:

Summary: <2–3 sentences describing what this app seems to be doing and how "normal" the traffic looks. If destination / geolocation information is available, explicitly mention where most of the data appears to be going (e.g., mostly domestic vs some traffic to other countries).>
Key insights: <2–4 of the most important observations about this app's behaviour. Do NOT include recommendations here.>
Overall risk: <Low, Medium, or High only. Do not add any explanation or extra words.>
Recommended actions: <Short, practical steps the user could take regarding this one app. Avoid boilerplate like "no actions required"; if you genuinely have no meaningful suggestions, keep this section very short.>

3) Use plain text. Do NOT use markdown, bullets, asterisks, emojis, or headings.
4) Be factual and grounded in the numbers you see. If something is unknown, say that clearly.
5) Total length should be under 180 words.

Now respond for this selected application only.
`
  }

  return `
You are PrivacyAI, a concise desktop network privacy assistant.

You are analysing the OVERALL network activity on a user's machine.

Overall capture context:
${baseContext}

Rules:
1) Describe overall behaviour across apps, not just one.
2) Always answer using EXACTLY these four sections, in this order:

Summary: <2–3 sentences summarising what the current capture looks like overall. If destination / geolocation information is available, explicitly mention where most of the data appears to be going (e.g., mostly local vs significant traffic to specific regions or countries).>
Key insights: <2–4 of the most important observations about this capture. Do NOT include recommendations here.>
Overall risk: <Low, Medium, or High only. Do not add any explanation or extra words.>
Recommended actions: <Short, practical steps the user could take to improve privacy or reduce unnecessary traffic. Avoid boilerplate like "no actions required"; if you genuinely have no meaningful suggestions, keep this section very short.>

3) Use plain text. Do NOT use markdown, bullets, asterisks, emojis, or headings.
4) Be factual and grounded in the numbers you see. If something is unknown, say that clearly.
5) Total length should be under 200 words.

Now respond for the overall session.
`
}

// This is the ONLY place that talks to the LLM.

export async function getPrivacySummary(snapshot: PrivacySnapshot): Promise<string> {
  // Guard against bad/empty input so we never crash on undefined
  if (!snapshot) {
    logger.warn('[PrivacyAI] No snapshot passed to getPrivacySummary, using empty summary')
    return buildLocalSummary({
      totalApps: 0,
      totalPackets: 0,
      topApps: []
    })
  }

  const apiKey = process.env.GOOGLE_API_KEY

  if (!apiKey) {
    logger.info('[PrivacyAI] No GOOGLE_API_KEY found, using local summary')
    return buildLocalSummary(snapshot)
  }

  logger.info('[PrivacyAI] GOOGLE_API_KEY present, calling Gemini...')

  const genAI = new GoogleGenerativeAI(apiKey)
  const enrichedSnapshot: PrivacySnapshot = { ...snapshot }

  const geo = enrichedSnapshot.geo

  if (geo && typeof geo === 'object') {
    const topCountries = Array.isArray(geo.topCountries) ? geo.topCountries : []

    if (topCountries.length > 0) {
      const parts = topCountries
        .filter(
          (entry): entry is { country: string; count: number } =>
            !!entry && typeof entry.country === 'string'
        )
        .map((entry) => {
          const country = entry.country
          const count = typeof entry.count === 'number' ? entry.count : undefined
          return count !== undefined ? `${country} (${count} flows)` : country
        })

      const totalFlows = typeof geo.totalFlows === 'number' ? geo.totalFlows : undefined

      enrichedSnapshot.geoSummary = `Most geo-identified flows appear to be going to: ${parts.join(
        ', '
      )}${
        totalFlows !== undefined
          ? `. Total geo-identified flows: ${totalFlows.toLocaleString()}.`
          : '.'
      }`

      const byCountry: Record<string, number> = {}
      for (const entry of topCountries) {
        if (!entry || typeof entry.country !== 'string') continue
        const key = entry.country
        const count = typeof entry.count === 'number' ? entry.count : 0
        byCountry[key] = (byCountry[key] ?? 0) + count
      }
      if (Object.keys(byCountry).length > 0) {
        enrichedSnapshot.geoByCountry = byCountry
      }
    }
  }

  const prompt = buildGeminiPrompt(enrichedSnapshot)

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: {
        temperature: 0.3
      }
    })

    const result = await model.generateContent(prompt)
    const text =
      result.response?.text?.() ?? result.response?.candidates?.[0]?.content?.parts?.[0]?.text

    logger.debug('[PrivacyAI] Gemini raw response:', JSON.stringify(result, null, 2))

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      logger.warn('[PrivacyAI] Gemini returned no usable text, falling back to local summary')
      return buildLocalSummary(snapshot)
    }

    return text.trim()
  } catch (err) {
    logger.error('[PrivacyAI] Gemini call failed, falling back:', err)
    return buildLocalSummary(snapshot)
  }
}
