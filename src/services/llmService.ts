/**
 * Browser-side LLM service.
 *
 * API keys are stored ONLY in localStorage and are NEVER sent to the game
 * server. All LLM requests go directly from the browser to the LLM provider
 * via CORS fetch().
 *
 * The game server has no knowledge of the user's API key.
 */

// ── Storage keys ─────────────────────────────────────────────────────────────
const KEY_LLM_CONFIG = 'open-agricola-llm-config'

export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'custom'

export type LlmConfig = {
  provider: LlmProvider
  apiKey: string
  model: string
  baseUrl?: string  // for custom/compatible providers
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'google/gemini-2.5-flash-preview',
  custom: 'gpt-4o',
}

/** Available models per provider, ordered by recommendation. */
export const PROVIDER_MODELS: Record<LlmProvider, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { id: 'o3-mini', label: 'o3-mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (65k)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (65k)' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (65k)' },
    { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (图片生成)' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B' },
  ],
  openrouter: [
    { id: 'google/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash' },
    { id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro' },
    { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'openai/gpt-4o', label: 'GPT-4o' },
    { id: 'deepseek/deepseek-chat-v3', label: 'DeepSeek V3' },
    { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    { id: 'qwen/qwen-plus', label: 'Qwen Plus (通义千问)' },
  ],
  custom: [],
}

/** Pre-configured base URLs for named providers (OpenAI-compatible). */
const PROVIDER_BASE_URLS: Partial<Record<LlmProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

/** Human-readable labels. */
export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  custom: '自定义',
}

/** Hint text for API key acquisition. */
export const PROVIDER_KEY_HINTS: Record<LlmProvider, string> = {
  openai: 'platform.openai.com/api-keys',
  anthropic: 'console.anthropic.com/settings/keys',
  gemini: 'aistudio.google.com/apikey',
  groq: 'console.groq.com/keys',
  openrouter: 'openrouter.ai/settings/keys',
  custom: '',
}

export const KEY_LLM_CONFIG_ART = 'open-agricola-llm-config-art'

export function getLlmConfig(storageKey?: string): LlmConfig | null {
  try {
    const raw = localStorage.getItem(storageKey ?? KEY_LLM_CONFIG)
    if (!raw) return null
    return JSON.parse(raw) as LlmConfig
  } catch {
    return null
  }
}

export function saveLlmConfig(config: LlmConfig, storageKey?: string): void {
  localStorage.setItem(storageKey ?? KEY_LLM_CONFIG, JSON.stringify(config))
}

export function clearLlmConfig(storageKey?: string): void {
  localStorage.removeItem(storageKey ?? KEY_LLM_CONFIG)
}

export function defaultModel(provider: LlmProvider): string {
  return DEFAULT_MODELS[provider]
}

// ── Message types ─────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

// ── Streaming chat ────────────────────────────────────────────────────────────

/**
 * Stream a chat response from the configured LLM provider.
 * Yields text chunks as they arrive.
 *
 * This function makes a direct CORS request to the provider's API —
 * it does NOT go through the game server.
 */
export async function* streamChat(
  messages: ChatMessage[],
  systemPrompt: string,
  config: LlmConfig,
): AsyncGenerator<string> {
  if (config.provider === 'anthropic') {
    yield* streamAnthropic(messages, systemPrompt, config)
  } else {
    // OpenAI and compatible providers
    yield* streamOpenAI(messages, systemPrompt, config)
  }
}

// ── OpenAI (and compatible) ───────────────────────────────────────────────────

async function* streamOpenAI(
  messages: ChatMessage[],
  systemPrompt: string,
  config: LlmConfig,
): AsyncGenerator<string> {
  const baseUrl = (config.baseUrl?.replace(/\/$/, '') || PROVIDER_BASE_URLS[config.provider] || 'https://api.openai.com/v1').replace(/\/$/, '')
  const url = baseUrl.endsWith('/v1') || baseUrl.endsWith('/openai')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`

  // Gemini 2.5+ defaults to 8192 output tokens; explicitly request max to avoid truncation
  const maxTokens = config.provider === 'gemini' ? 65536 : 8192

  const body = {
    model: config.model,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.7,
    max_tokens: maxTokens,
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`OpenAI API error ${resp.status}: ${err}`)
  }

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue
      try {
        const data = JSON.parse(trimmed.slice(6))
        const delta = data.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // ignore parse errors in stream
      }
    }
  }
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function* streamAnthropic(
  messages: ChatMessage[],
  systemPrompt: string,
  config: LlmConfig,
): AsyncGenerator<string> {
  const url = 'https://api.anthropic.com/v1/messages'

  const body = {
    model: config.model,
    stream: true,
    system: systemPrompt,
    messages,
    max_tokens: 8192,
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Anthropic API error ${resp.status}: ${err}`)
  }

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      try {
        const data = JSON.parse(trimmed.slice(6))
        if (data.type === 'content_block_delta' && data.delta?.text) {
          yield data.delta.text
        }
      } catch {
        // ignore
      }
    }
  }
}

// ── Card extraction from LLM response ────────────────────────────────────────

/**
 * Extract card metadata + effects from a TypeScript code block in LLM response.
 * Falls back to JSON extraction for backwards compatibility.
 */
export function extractCardFromResponse(text: string): {
  card: Record<string, unknown>
  effects: Record<string, unknown> | null
  sourceCode: string
} | null {
  // Try TypeScript code blocks first
  const tsMatches = [...text.matchAll(/```(?:typescript|ts)\s*([\s\S]*?)```/g)]
  if (tsMatches.length > 0) {
    const code = tsMatches[tsMatches.length - 1]![1]!.trim()
    const parsed = parseCardFromTs(code)
    if (parsed) return parsed
  }

  // Fall back to any code block (might be TS without language tag)
  const anyMatches = [...text.matchAll(/```\s*([\s\S]*?)```/g)]
  for (let i = anyMatches.length - 1; i >= 0; i--) {
    const block = anyMatches[i]![1]!.trim()
    // Check if it looks like TypeScript (has const CARD_ID or import)
    if (block.includes('CARD_ID') || block.includes("from '../../shared/cards/")) {
      const parsed = parseCardFromTs(block)
      if (parsed) return parsed
    }
    // Try JSON
    try {
      const json = JSON.parse(block) as Record<string, unknown>
      if (json.card) return { card: json.card as Record<string, unknown>, effects: (json.effects as Record<string, unknown>) ?? null, sourceCode: '' }
      return null
    } catch { /* not JSON */ }
  }

  return null
}

/**
 * Parse card metadata from TypeScript source code.
 */
function parseCardFromTs(code: string): {
  card: Record<string, unknown>
  effects: Record<string, unknown> | null
  sourceCode: string
} | null {
  // Extract card_type from class constructor
  const isOccupation = /new\s+Occupation\s*\(/.test(code)
  const isMinor = /new\s+MinorImprovement\s*\(/.test(code)
  if (!isOccupation && !isMinor) return null

  const cardType = isOccupation ? 'occupation' : 'minor'

  // Extract CARD_ID
  const idMatch = code.match(/const\s+CARD_ID\s*=\s*['"]([^'"]+)['"]/)
  const cardId = idMatch?.[1] ?? 'CUSTOM_Unknown'

  // Extract the card definition object — find the constructor argument
  const constructorPattern = /new\s+(?:MinorImprovement|Occupation)\s*\(\s*\{([\s\S]*)\}\s*\)\s*$/m
  const ctorMatch = code.match(constructorPattern)
  if (!ctorMatch) return null

  const objStr = ctorMatch[1]!

  // Parse fields from the object literal
  const name = extractStringField(objStr, 'name') ?? cardId
  const desc = extractArrayField(objStr, 'desc') ?? []
  const vp = extractNumberField(objStr, 'vp') ?? 0
  const cost = extractObjectField(objStr, 'cost') ?? {}
  const modifiers = extractModifiers(objStr)

  // Check if registerCardEffect exists → has effects
  const hasEffects = /registerCardEffect\s*\(/.test(code)

  const card: Record<string, unknown> = {
    id: cardId,
    name,
    card_type: cardType,
    cost,
    vp,
    desc,
  }
  if (modifiers.length > 0) card.modifiers = modifiers

  return {
    card,
    effects: hasEffects ? { _hasCode: true } : null,
    sourceCode: code,
  }
}

function extractStringField(objStr: string, field: string): string | null {
  // Match: name: 'xxx' or name: "xxx"
  const re = new RegExp(`${field}\\s*:\\s*(['"])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`)
  const m = objStr.match(re)
  return m?.[2] ?? null
}

function extractNumberField(objStr: string, field: string): number | null {
  const re = new RegExp(`${field}\\s*:\\s*(\\d+)`)
  const m = objStr.match(re)
  return m ? Number(m[1]) : null
}

function extractArrayField(objStr: string, field: string): string[] | null {
  // Match desc: ['...', '...']
  const re = new RegExp(`${field}\\s*:\\s*\\[([^\\]]*?)\\]`)
  const m = objStr.match(re)
  if (!m) return null
  const items = [...m[1]!.matchAll(/['"]([^'"]*)['"]/g)].map(x => x[1]!)
  return items.length > 0 ? items : null
}

function extractObjectField(objStr: string, field: string): Record<string, number> | null {
  const re = new RegExp(`${field}\\s*:\\s*\\{([^}]*)\\}`)
  const m = objStr.match(re)
  if (!m) return null
  const result: Record<string, number> = {}
  for (const [, k, v] of m[1]!.matchAll(/(\w+)\s*:\s*(\d+)/g)) {
    result[k!] = Number(v!)
  }
  return result
}

function extractModifiers(objStr: string): unknown[] {
  // Simple check: does it have modifiers: [...]?
  if (!objStr.includes('modifiers')) return []
  // Extract the modifiers array content
  const re = /modifiers\s*:\s*\[([\s\S]*?)\]\s*,?\s*(?:implemented|$)/
  const m = objStr.match(re)
  if (!m) return []
  // Try to parse each object in the array
  const results: unknown[] = []
  const objMatches = m[1]!.matchAll(/\{([^}]+)\}/g)
  for (const om of objMatches) {
    try {
      // Convert JS object literal to JSON
      const jsonStr = '{' + om[1]!
        .replace(/(\w+)\s*:/g, '"$1":')
        .replace(/'/g, '"')
        + '}'
      results.push(JSON.parse(jsonStr))
    } catch { /* skip malformed */ }
  }
  return results
}

/** @deprecated Use extractCardFromResponse instead */
export function extractCardJson(text: string): Record<string, unknown> | null {
  const result = extractCardFromResponse(text)
  if (!result) return null
  return { card: result.card, effects: result.effects }
}

// ── Image generation ──────────────────────────────────────────────────────────

/**
 * Build art generation prompt based on card type and locale.
 * Occupation cards: person in circular gold-trimmed border (Klemens Franz style)
 * Minor improvement cards: object in hexagonal gold-trimmed border
 */
export function buildCardArtPrompt(
  subject: string,
  cardType: 'minor' | 'occupation',
  locale: 'zh' | 'en',
): string {
  if (cardType === 'occupation') {
    return locale === 'zh'
      ? `一幅《农场主》(Agricola)桌游"职业卡"风格的2D插画，完全致敬画师 Klemens Franz。画面主体是${subject}（半身像构图）。角色造型略显粗犷讨喜，具有粗黑墨水勾边和平涂水彩质感，背景是简单的乡村农田风光。画面被完美地框在一个带金边的圆形画框内，框外为纯白背景。画面中绝对不允许出现任何文字、字母、单词或标签。`
      : `A 2D illustration for an Agricola board game "Occupation" card, closely matching the art style of Klemens Franz. It features ${subject}. The character has a quirky, slightly chunky, and charming design, drawn with thick dark ink outlines and flat watercolor texturing. The background is a simple rustic agricultural landscape. The illustration is perfectly enclosed within a gold-trimmed circular border, with a solid white background outside the circle. STRICTLY NO TEXT, NO WORDS, NO LETTERS, AND NO LABELS ANYWHERE IN THE IMAGE.`
  }
  // Minor improvement
  return locale === 'zh'
    ? `一幅《农场主》(Agricola)桌游"次要发展卡"风格的2D插画，完全致敬画师 Klemens Franz。画面特写${subject}。具有粗黑墨水勾边和平涂水彩质感，重点突出物品的质朴感、手工制作痕迹与中世纪实用性。柔和的大地色系，以温暖的棕色和绿色为主。画面被完美地框在一个带金边的【六角形】画框内，框外为纯白背景。画面中绝对不允许出现任何文字、字母、单词或标签。完全的2D平面插画，不要3D，不要写实元素。`
    : `A 2D illustration for an Agricola board game "Minor Improvement" card, in the exact art style of Klemens Franz. It features a close-up of ${subject}. Drawn with thick dark ink outlines and flat watercolor texturing. Focus on the object's rustic, handmade texture and medieval utility. Earthy muted colors with warm browns and greens. The illustration is perfectly enclosed within a gold-trimmed hexagon border, with a solid white background outside the hexagon. STRICTLY NO TEXT, NO WORDS, NO LETTERS, AND NO LABELS ANYWHERE IN THE IMAGE. purely 2D flat illustration, no 3d, no realistic elements.`
}

/**
 * Returns true if this provider/config supports image generation.
 */
export function supportsImageGeneration(config: LlmConfig): boolean {
  return config.provider === 'openai' || config.provider === 'gemini' || !!config.baseUrl
}

/**
 * Generate card art via DALL-E (OpenAI/custom) or Gemini native image generation.
 * Returns a data URL or null on failure.
 */
export type ReferenceImage = { data: string; mimeType: string }

export async function generateCardArt(
  prompt: string,
  config: LlmConfig,
  referenceImages?: ReferenceImage[],
): Promise<string | null> {
  // Gemini: native image generation via generateContent (with optional reference images)
  if (config.provider === 'gemini') {
    try {
      const textPart = { text: prompt }
      const imgParts = (referenceImages ?? []).map(img => ({
        inlineData: { mimeType: img.mimeType, data: img.data },
      }))
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [textPart, ...imgParts] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        },
      )
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: { message?: string } }
        throw new Error(err.error?.message ?? `HTTP ${resp.status}`)
      }
      const data = await resp.json() as {
        candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
      }
      const parts = data.candidates?.[0]?.content?.parts ?? []
      const imgPart = parts.find(p => p.inlineData?.data)
      if (!imgPart?.inlineData?.data) return null
      const mime = imgPart.inlineData.mimeType ?? 'image/png'
      return `data:${mime};base64,${imgPart.inlineData.data}`
    } catch (e) {
      throw e
    }
  }

  // OpenAI or custom baseUrl: use DALL-E 3
  if (config.provider !== 'openai' && !config.baseUrl) return null

  const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://api.openai.com'

  try {
    const resp = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      }),
    })

    if (!resp.ok) {
      const err = await resp.text().catch(() => '')
      throw new Error(`OpenAI image API error ${resp.status}: ${err}`)
    }
    const data = await resp.json() as { data?: { b64_json?: string }[] }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) return null
    return `data:image/png;base64,${b64}`
  } catch {
    return null
  }
}
