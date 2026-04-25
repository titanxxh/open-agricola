// client/services/llm/index.ts
// Public API for the LLM service. Re-exports types and provides the
// dispatcher (streamChat, generateCardArt). Card-extraction helpers and the
// localStorage-backed config helpers live in card-utils.ts.
import type { ChatMessage, LlmConfig, ReferenceImage } from './types'
import { getProvider } from './registry'
import { openaiCompatStreamChat, openaiCompatGenerateImage } from './openai-compat'

export type { ProviderId, LlmConfig, ChatMessage, ReferenceImage, ProviderDef } from './types'
export { PROVIDERS, getProvider, listProviders } from './registry'

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
