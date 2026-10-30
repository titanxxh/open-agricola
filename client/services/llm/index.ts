// client/services/llm/index.ts
// Public API for provider configuration, browser translation and image generation.
// Workshop ability generation uses the generation/ module.
import type { LlmConfig, ReferenceImage } from './types'
import { getProvider, listModelsFor } from './registry'
import { openaiCompatGenerateImage } from './openai-compat'

export type { ProviderId, LlmConfig, ChatMessage, ReferenceImage, ProviderDef, Capabilities, ModelDef } from './types'
export { PROVIDERS, getProvider, listProviders, listModelsFor, defaultModelFor } from './registry'

export { streamChat } from './stream-chat'

export async function generateCardArt(
  prompt: string,
  config: LlmConfig,
  referenceImages?: ReferenceImage[],
): Promise<string | null> {
  const def = getProvider(config.provider)
  if (!supportsImageGeneration(config)) {
    throw new Error(`Provider ${def.label} model ${config.model} does not support image generation`)
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
    const def = getProvider(config.provider)
    // Curated providers: the specific saved model must be image-capable.
    if (def.models.length > 0) {
      return listModelsFor(def, 'image').some(m => m.id === config.model)
    }
    // Custom (free-form) providers: fall back to provider-level capability.
    return def.capabilities.image
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

// ── Re-export card-utils ────────────────────────────────────────────────────
export {
  translateCardContent,
  buildCardArtPrompt,
} from './card-utils'
