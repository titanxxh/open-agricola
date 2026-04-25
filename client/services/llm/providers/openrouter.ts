// client/services/llm/providers/openrouter.ts
import type { ProviderDef } from '../types'

export const openrouterProvider: ProviderDef = {
  id: 'openrouter',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'qwen/qwen3.6-plus:free',
  models: [
    { id: 'qwen/qwen3.6-plus:free', label: 'Qwen 3.6 Plus (免费)' },
    { id: 'google/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash' },
    { id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro' },
    { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (免费)' },
    { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (免费)' },
    { id: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick (免费)' },
  ],
  apiKeyHint: 'openrouter.ai/settings/keys',
  apiKeyHelpUrl: 'https://openrouter.ai/settings/keys',
  capabilities: { chat: true, image: false },
}
