/**
 * Minimal LLM client for the card-gen test suite. Calls OpenAI-compatible
 * chat completions endpoints (Gemini exposes one at
 * generativelanguage.googleapis.com/v1beta/openai). No streaming; just blocking
 * call and return the first choice's content.
 *
 * Retries on 429 / 5xx (configurable). Other 4xx errors are thrown immediately.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Provider = 'gemini' | 'openai' | 'openrouter' | 'deepseek' | 'aihubmix'
export type LlmTestPurpose = 'code' | 'image'
export type LlmTestConfig = { provider: Provider; model: string }

export const PROVIDER_BASE_URL: Record<Provider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  aihubmix: 'https://aihubmix.com/v1/chat/completions',
}

const PROVIDER_KEY_ENVS: Record<Provider, readonly string[]> = {
  gemini: ['GEMINI_API_KEY', 'MY_TEST_GEMINI_APIKEY'],
  openai: ['OPENAI_API_KEY', 'MY_TEST_OPENAI_APIKEY'],
  openrouter: ['OPENROUTER_API_KEY', 'MY_TEST_OPENROUTER_APIKEY'],
  deepseek: ['DEEPSEEK_API_KEY', 'MY_TEST_DEEPSEEK_APIKEY'],
  aihubmix: ['AIHUBMIX_API_KEY', 'MY_TEST_AIHUBMIX_APIKEY'],
}

const DEFAULT_TEST_CONFIG: Record<LlmTestPurpose, LlmTestConfig> = {
  code: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  image: { provider: 'aihubmix', model: 'gemini-3.1-flash-image-preview-free' },
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

class LLMError extends Error {
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
  const envNames = PROVIDER_KEY_ENVS[provider]
  for (const envName of envNames) {
    const key = process.env[envName]
    if (key) return key
  }
  const dotenv = readDotenv()
  for (const envName of envNames) {
    const key = dotenv[envName]
    if (key) return key
  }
  throw new Error(`missing env ${envNames.join(' or ')} for provider ${provider}`)
}

function readDotenv(): Record<string, string> {
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8')
    const result: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

export function resolveLlmTestConfig(purpose: LlmTestPurpose): LlmTestConfig {
  const defaults = DEFAULT_TEST_CONFIG[purpose]
  if (purpose === 'code') {
    return {
      provider: (process.env.LLM_TEST_CODE_PROVIDER ?? defaults.provider) as Provider,
      model: process.env.LLM_TEST_CODE_MODEL ?? defaults.model,
    }
  }
  return {
    provider: (process.env.LLM_TEST_IMAGE_PROVIDER ?? defaults.provider) as Provider,
    model: process.env.LLM_TEST_IMAGE_MODEL ?? defaults.model,
  }
}
