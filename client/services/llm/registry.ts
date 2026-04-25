// client/services/llm/registry.ts
// Central registry of LLM providers. Adding a provider = create a file under
// providers/, import it here, and add one entry to PROVIDERS.
import type { ProviderDef, ProviderId } from './types'
import { openaiProvider } from './providers/openai'
import { groqProvider } from './providers/groq'
import { openrouterProvider } from './providers/openrouter'

export const PROVIDERS: Partial<Record<ProviderId, ProviderDef>> = {
  openai: openaiProvider,
  groq: groqProvider,
  openrouter: openrouterProvider,
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
