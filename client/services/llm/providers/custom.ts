// client/services/llm/providers/custom.ts
import type { ProviderDef } from '../types'

export const customProvider: ProviderDef = {
  id: 'custom',
  label: '自定义',
  // baseUrl deliberately omitted — read from LlmConfig.baseUrl at call time.
  defaultModel: 'gpt-4o',
  models: [],
  apiKeyHint: '',
  // Custom servers may or may not have image generation; assume yes — the
  // request will fail with a clear HTTP error if they don't.
  capabilities: { chat: true, image: true },
}
