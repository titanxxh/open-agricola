// client/services/llm/registry.ts
// Central registry of LLM providers. Adding a provider = create a file under
// providers/, import it here, and add one entry to PROVIDERS.
import type { Capabilities, ModelDef, ProviderDef, ProviderId } from './types'
import { openaiProvider } from './providers/openai'
import { geminiProvider } from './providers/gemini'
import { anthropicProvider } from './providers/anthropic'
import { groqProvider } from './providers/groq'
import { openrouterProvider } from './providers/openrouter'
import { deepseekProvider } from './providers/deepseek'
import { customProvider } from './providers/custom'

export const PROVIDERS: Partial<Record<ProviderId, ProviderDef>> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  groq: groqProvider,
  openrouter: openrouterProvider,
  deepseek: deepseekProvider,
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

/**
 * Return the subset of a provider's models that support the requested
 * capability. A model declares capabilities explicitly; if not, falls back
 * to the provider-level capability flag.
 */
export function listModelsFor(
  provider: ProviderDef,
  cap: keyof Capabilities,
): ReadonlyArray<ModelDef> {
  return provider.models.filter(m => {
    const tag = m.capabilities ?? {}
    return tag[cap] ?? provider.capabilities[cap]
  })
}

/**
 * Pick the best default model for a (provider, capability) pair:
 * 1. provider.defaultModel if it supports the capability
 * 2. otherwise, the first capability-matching model
 * 3. otherwise, null (no valid model — caller should disable UI)
 */
export function defaultModelFor(
  provider: ProviderDef,
  cap: keyof Capabilities,
): string | null {
  const matches = listModelsFor(provider, cap)
  if (matches.length === 0) return null
  const def = matches.find(m => m.id === provider.defaultModel)
  return (def ?? matches[0]).id
}
