// client/services/llm/openai-compat.ts
import type { ChatMessage, LlmConfig, ReferenceImage } from './types'

/**
 * OpenAI-compatible chat completion stream.
 * `baseUrl` MUST already include the version segment (e.g. `/v1` or
 * `/v1beta/openai`). The path `/chat/completions` is appended directly.
 */
export async function* openaiCompatStreamChat(
  messages: ChatMessage[],
  systemPrompt: string,
  config: LlmConfig,
  baseUrl: string,
  options?: { maxTokens?: number },
): AsyncGenerator<string> {
  const trimmed = baseUrl.replace(/\/$/, '')
  const url = `${trimmed}/chat/completions`
  const body = {
    model: config.model,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.7,
    max_tokens: options?.maxTokens ?? 8192,
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
    throw new Error(`LLM API error ${resp.status}: ${err}`)
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
        // ignore parse errors mid-stream
      }
    }
  }
}

/**
 * DALL·E 3 image generation through OpenAI's /v1/images/generations.
 * Returns a `data:image/png;base64,...` URL, or null on parse failure.
 */
export async function openaiCompatGenerateImage(
  prompt: string,
  config: LlmConfig,
  baseUrl: string,
  _referenceImages?: ReferenceImage[],
): Promise<string | null> {
  const trimmed = baseUrl.replace(/\/$/, '')
  // baseUrl ends in `/v1` for presets; strip the trailing /v1 if present so we
  // can call /v1/images/generations consistently.
  const root = trimmed.replace(/\/v1$/, '')
  const url = `${root}/v1/images/generations`

  const resp = await fetch(url, {
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
}
