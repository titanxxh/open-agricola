// client/services/llm/providers/openai.ts
import type { ProviderDef } from '../types'

export const openaiProvider: ProviderDef = {
  id: 'openai',
  label: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o',
  models: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { id: 'o3-mini', label: 'o3-mini' },
  ],
  apiKeyHint: 'platform.openai.com/api-keys',
  apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
  capabilities: { chat: true, image: true },
  // No overrides — uses openai-compat for both chat and image.
}
