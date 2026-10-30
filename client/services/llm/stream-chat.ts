import type { ChatMessage, LlmConfig } from './types'
import { getProvider } from './registry'
import { openaiCompatStreamChat } from './openai-compat'

export async function* streamChat(
  messages: ChatMessage[],
  systemPrompt: string,
  config: LlmConfig,
): AsyncGenerator<string> {
  const def = getProvider(config.provider)
  const baseUrl = config.baseUrl ?? def.baseUrl
  if (!baseUrl) throw new Error(`Provider ${config.provider} has no baseUrl`)
  yield* openaiCompatStreamChat(messages, systemPrompt, config, baseUrl, { maxTokens: def.maxOutputTokens })
}
