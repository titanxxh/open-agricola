// client/services/llm/providers/deepseek.ts
import type { ProviderDef } from '../types'

export const deepseekProvider: ProviderDef = {
  id: 'deepseek',
  label: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  defaultModel: 'deepseek-v4-flash',
  models: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (推理)' },
  ],
  apiKeyHint: 'platform.deepseek.com/api_keys',
  apiKeyHelpUrl: 'https://platform.deepseek.com/api_keys',
  capabilities: { chat: true, image: false },
  // No overrides — uses openai-compat. deepseek-v4-pro may emit
  // reasoning_content alongside content; we only render content. Final
  // answers stream correctly either way.
}
