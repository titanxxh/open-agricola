// client/services/llm/registry.ts
// Central registry of LLM providers. Adding a provider = create a file under
// providers/, import it here, and add one entry to PROVIDERS.
import type { ProviderDef, ProviderId } from './types'

// Providers registered below as each Task adds them.

export const PROVIDERS: Record<ProviderId, ProviderDef> = {} as Record<ProviderId, ProviderDef>

export function getProvider(id: ProviderId): ProviderDef {
  const def = PROVIDERS[id]
  if (!def) throw new Error(`Unknown LLM provider: ${id}`)
  return def
}

export function listProviders(): ProviderDef[] {
  // Object.values preserves insertion order — order matches the imports above.
  return Object.values(PROVIDERS)
}
