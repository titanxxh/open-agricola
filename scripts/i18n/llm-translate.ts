import { callLLM } from '../../tests/llm-card-gen/llm-client'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MissingKey } from '../i18n-audit'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../..')

export interface Translation {
  zh: string
  en: string
}

const SYSTEM_PROMPT = `You are a precise i18n translator for a board game (Agricola, German style).
Output STRICT JSON only — no prose, no markdown fence. Every key in the input list
gets exactly one entry in the output object: { "<key>": { "zh": "...", "en": "..." } }.
Keep placeholder names like {actplayer}, {round}, {count} verbatim. Use natural Chinese
(Simplified) and concise English. Match the existing style samples — same tone, same
register, same punctuation. If a reference translation is provided, prefer wording closely
aligned with the reference English text but ensure the Chinese reads naturally.`

export function buildTranslatePrompt(
  missing: MissingKey[],
  styleSamples: Map<string, Array<{ key: string; zh: string; en: string }>>,
  referenceCandidates: Map<string, string[]>,
): string {
  const parts: string[] = []
  parts.push('# Style samples (existing translations to match)')
  for (const [prefix, samples] of styleSamples) {
    parts.push(`\n## ${prefix}`)
    for (const s of samples.slice(0, 5)) {
      parts.push(`- ${s.key}: zh="${s.zh}" / en="${s.en}"`)
    }
  }
  parts.push('\n# Keys to translate')
  for (const m of missing) {
    parts.push(`\n## ${m.key}`)
    parts.push(`Used at: ${m.referencedAt[0] ?? '(unknown)'}`)
    const cands = referenceCandidates.get(m.key) ?? []
    if (cands.length > 0) {
      parts.push('reference candidates:')
      for (const c of cands.slice(0, 3)) parts.push(`- ${c}`)
    }
  }
  parts.push('\n# Output')
  parts.push('Output a single JSON object: { "<key>": { "zh": "...", "en": "..." }, ... }')
  parts.push('No prose. No markdown. Strict JSON.')
  return parts.join('\n')
}

export function parseTranslateResponse(text: string): Map<string, Translation> {
  let json = text.trim()
  const fence = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence) json = fence[1].trim()
  const parsed = JSON.parse(json) as Record<string, Translation>
  const out = new Map<string, Translation>()
  for (const [k, v] of Object.entries(parsed)) {
    if (v && typeof v === 'object' && typeof v.zh === 'string' && typeof v.en === 'string') {
      out.set(k, { zh: v.zh, en: v.en })
    }
  }
  return out
}

function loadGeminiKey(): string {
  const envPath = path.resolve(REPO_ROOT, '.env')
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^(MY_TEST_GEMINI_APIKEY|GEMINI_API_KEY)=(.+)$/)
      if (m) return m[2].trim()
    }
  }
  const env = process.env.MY_TEST_GEMINI_APIKEY ?? process.env.GEMINI_API_KEY
  if (env) return env
  throw new Error('No Gemini API key found (looked at .env MY_TEST_GEMINI_APIKEY / GEMINI_API_KEY)')
}

export async function translateBatch(
  missing: MissingKey[],
  styleSamples: Map<string, Array<{ key: string; zh: string; en: string }>>,
  referenceCandidates: Map<string, string[]>,
): Promise<Map<string, Translation>> {
  const apiKey = loadGeminiKey()
  const userMessage = buildTranslatePrompt(missing, styleSamples, referenceCandidates)
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await callLLM({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        apiKey,
        timeoutMs: 120_000,
        maxRetries: 2,
      })
      return parseTranslateResponse(text)
    } catch (e) {
      lastErr = e
      console.error(`translateBatch attempt ${attempt} failed: ${(e as Error).message}`)
    }
  }
  throw new Error(`translateBatch failed after 2 attempts: ${lastErr}`)
}
