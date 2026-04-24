/**
 * Minimal LLM client for the card-gen test suite. Calls OpenAI-compatible
 * chat completions endpoints (Gemini exposes one at
 * generativelanguage.googleapis.com/v1beta/openai). No streaming; just blocking
 * call and return the first choice's content.
 *
 * Retries on 429 / 5xx (configurable). Other 4xx errors are thrown immediately.
 */

export type Provider = 'gemini' | 'openai'

export const PROVIDER_BASE_URL: Record<Provider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
}

export interface CallLLMOptions {
  provider: Provider
  model: string
  systemPrompt: string
  userMessage: string
  apiKey: string
  /** Single-request timeout in ms. Default 60_000. */
  timeoutMs?: number
  /** Max retries on 429 / 5xx / network error. Default 3. */
  maxRetries?: number
  /** Sleep between retries in ms. Default 60_000. */
  retryDelayMs?: number
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message)
    this.name = 'LLMError'
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function callLLM(opts: CallLLMOptions): Promise<string> {
  const url = PROVIDER_BASE_URL[opts.provider]
  const timeoutMs = opts.timeoutMs ?? 60_000
  const maxRetries = opts.maxRetries ?? 3
  const retryDelayMs = opts.retryDelayMs ?? 60_000

  const body = JSON.stringify({
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userMessage },
    ],
    temperature: 0.2,
    stream: false,
  })

  let lastError: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const content = json.choices?.[0]?.message?.content
        if (typeof content !== 'string' || content.length === 0) {
          throw new LLMError(
            `empty content from provider response: ${JSON.stringify(json).slice(0, 500)}`,
          )
        }
        return content
      }

      const text = await res.text().catch(() => '')
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600)
      if (!retryable || attempt === maxRetries) {
        throw new LLMError(
          `HTTP ${res.status} from ${opts.provider}`,
          res.status,
          text.slice(0, 500),
        )
      }
      lastError = new LLMError(`HTTP ${res.status}`, res.status, text.slice(0, 200))
      console.warn(
        `[llm-client] attempt ${attempt + 1}/${maxRetries + 1} got ${res.status}; sleeping ${retryDelayMs}ms`,
      )
      await sleep(retryDelayMs)
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof LLMError && err.status && err.status < 500 && err.status !== 429) {
        throw err
      }
      if (attempt === maxRetries) {
        throw err instanceof Error ? err : new Error(String(err))
      }
      lastError = err
      console.warn(
        `[llm-client] attempt ${attempt + 1}/${maxRetries + 1} threw ${(err as Error)?.message}; sleeping ${retryDelayMs}ms`,
      )
      await sleep(retryDelayMs)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('callLLM exhausted retries')
}

export function readApiKey(provider: Provider): string {
  const envName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
  const key = process.env[envName]
  if (!key) {
    throw new Error(`missing env ${envName} for provider ${provider}`)
  }
  return key
}
