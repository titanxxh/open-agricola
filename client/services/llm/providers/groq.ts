// client/services/llm/providers/groq.ts
import type { ProviderDef } from '../types'

export const groqProvider: ProviderDef = {
  id: 'groq',
  label: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  defaultModel: 'llama-3.3-70b-versatile',
  models: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B' },
  ],
  apiKeyHint: 'console.groq.com/keys',
  apiKeyHelpUrl: 'https://console.groq.com/keys',
  capabilities: { chat: true, image: false },
}
