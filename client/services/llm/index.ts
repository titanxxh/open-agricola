// client/services/llm/index.ts
// Public API for the LLM service. Re-exports types and provides the
// dispatcher (streamChat, generateCardArt). Card-extraction helpers and the
// localStorage-backed config helpers live in card-utils.ts.
import type { ChatMessage, LlmConfig, ReferenceImage, ProviderId } from './types'
import { getProvider, PROVIDERS } from './registry'
import { openaiCompatStreamChat, openaiCompatGenerateImage } from './openai-compat'

export type { ProviderId, LlmConfig, ChatMessage, ReferenceImage, ProviderDef, Capabilities, ModelDef } from './types'
export { PROVIDERS, getProvider, listProviders, listModelsFor, defaultModelFor } from './registry'

export async function* streamChat(
  messages: ChatMessage[],
  systemPrompt: string,
  config: LlmConfig,
): AsyncGenerator<string> {
  const def = getProvider(config.provider)
  if (def.streamChat) {
    yield* def.streamChat(messages, systemPrompt, config)
    return
  }
  const baseUrl = config.baseUrl ?? def.baseUrl
  if (!baseUrl) throw new Error(`Provider ${config.provider} has no baseUrl`)
  yield* openaiCompatStreamChat(messages, systemPrompt, config, baseUrl, { maxTokens: def.maxOutputTokens })
}

export async function generateCardArt(
  prompt: string,
  config: LlmConfig,
  referenceImages?: ReferenceImage[],
): Promise<string | null> {
  const def = getProvider(config.provider)
  if (!def.capabilities.image) {
    throw new Error(`Provider ${def.label} does not support image generation`)
  }
  if (def.generateImage) {
    return def.generateImage(prompt, config, referenceImages)
  }
  const baseUrl = config.baseUrl ?? def.baseUrl
  if (!baseUrl) throw new Error(`Provider ${config.provider} has no baseUrl`)
  return openaiCompatGenerateImage(prompt, config, baseUrl, referenceImages)
}

export function supportsImageGeneration(config: LlmConfig): boolean {
  try {
    return getProvider(config.provider).capabilities.image
  } catch {
    return false
  }
}

// ── localStorage-backed config helpers ──────────────────────────────────────
const KEY_LLM_CONFIG = 'open-agricola-llm-config'
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

export function defaultModel(provider: ProviderId): string {
  return getProvider(provider).defaultModel
}

// ── Backwards-compat exports (computed from PROVIDERS) ──────────────────────
// AiCardDesigner.tsx still reads these as Record<LlmProvider, …>. We compute
// them once from PROVIDERS so the registry stays the source of truth.

export type LlmProvider = ProviderId

export const PROVIDER_LABELS = Object.fromEntries(
  Object.entries(PROVIDERS).map(([id, def]) => [id, def!.label]),
) as Record<ProviderId, string>

export const PROVIDER_KEY_HINTS = Object.fromEntries(
  Object.entries(PROVIDERS).map(([id, def]) => [id, def!.apiKeyHint]),
) as Record<ProviderId, string>

export const PROVIDER_MODELS = Object.fromEntries(
  Object.entries(PROVIDERS).map(([id, def]) => [id, def!.models]),
) as Record<ProviderId, ReadonlyArray<{ id: string; label: string }>>

// ── Re-export card-utils ────────────────────────────────────────────────────
export {
  extractCardFromResponse,
  extractCardJson,
  translateCardContent,
  buildCardArtPrompt,
} from './card-utils'
