// client/services/llm/registry.ts
// Central registry of LLM providers. Adding a provider = create a file under
// providers/, import it here, and add one entry to PROVIDERS.
import type { ProviderDef, ProviderId } from './types'
import { openaiProvider } from './providers/openai'
import { geminiProvider } from './providers/gemini'
import { anthropicProvider } from './providers/anthropic'
import { groqProvider } from './providers/groq'
import { openrouterProvider } from './providers/openrouter'
import { customProvider } from './providers/custom'

export const PROVIDERS: Partial<Record<ProviderId, ProviderDef>> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  groq: groqProvider,
  openrouter: openrouterProvider,
  custom: customProvider,
}

export function getProvider(id: ProviderId): ProviderDef {
  const def = PROVIDERS[id]
  if (!def) throw new Error(`Unknown LLM provider: ${id}`)
  return def
}

export function listProviders(): ProviderDef[] {
  // Object.values preserves insertion order — providers appear in registration order.
  return Object.values(PROVIDERS)
}
