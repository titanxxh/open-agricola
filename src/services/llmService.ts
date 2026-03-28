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

export type LlmProvider = 'openai' | 'anthropic' | 'custom'

export type LlmConfig = {
  provider: LlmProvider
  apiKey: string
  model: string
  baseUrl?: string  // for custom/compatible providers
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  custom: 'gpt-4o',
}

export function getLlmConfig(): LlmConfig | null {
  try {
    const raw = localStorage.getItem(KEY_LLM_CONFIG)
    if (!raw) return null
    return JSON.parse(raw) as LlmConfig
  } catch {
    return null
  }
}

export function saveLlmConfig(config: LlmConfig): void {
  localStorage.setItem(KEY_LLM_CONFIG, JSON.stringify(config))
}

export function clearLlmConfig(): void {
  localStorage.removeItem(KEY_LLM_CONFIG)
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
  const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://api.openai.com'
  const url = `${baseUrl}/v1/chat/completions`

  const body = {
    model: config.model,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.7,
    max_tokens: 2048,
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
    max_tokens: 2048,
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

// ── Card JSON extraction ──────────────────────────────────────────────────────

/**
 * Extract the last JSON code block from an LLM response.
 * Returns parsed object or null.
 */
export function extractCardJson(text: string): Record<string, unknown> | null {
  // Match ```json ... ``` or ``` ... ``` blocks
  const matches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  if (matches.length === 0) {
    // Try to find a raw JSON object
    const jsonMatch = /(\{[\s\S]*\})/.exec(text)
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]!) } catch { return null }
    }
    return null
  }
  // Use the last match
  const last = matches[matches.length - 1]!
  try {
    return JSON.parse(last[1]!.trim())
  } catch {
    return null
  }
}

// ── Image generation ──────────────────────────────────────────────────────────

/**
 * Generate card art via DALL-E (OpenAI only).
 * Returns a data URL or null on failure.
 */
export async function generateCardArt(
  cardName: string,
  cardDesc: string,
  config: LlmConfig,
): Promise<string | null> {
  if (config.provider !== 'openai' && !config.baseUrl) return null

  const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://api.openai.com'
  const prompt = `Medieval farming board game card illustration. Watercolor style, warm earth tones, medieval European pastoral setting. Card: "${cardName}". Scene: ${cardDesc}. Single centered illustration, no text, no borders, square composition.`

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

    if (!resp.ok) return null
    const data = await resp.json() as { data?: { b64_json?: string }[] }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) return null
    return `data:image/png;base64,${b64}`
  } catch {
    return null
  }
}
