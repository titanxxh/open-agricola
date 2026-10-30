// client/services/llm/providers/deepseek.ts
import type { ProviderDef } from '../types'

export const deepseekProvider: ProviderDef = {
  id: 'deepseek',
  label: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  defaultModel: 'deepseek-flash',
  models: [
    { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (0813)' },
  ],
  apiKeyHint: 'platform.deepseek.com/api_keys',
  apiKeyHelpUrl: 'https://platform.deepseek.com/api_keys',
  capabilities: { chat: true, image: false },
}
