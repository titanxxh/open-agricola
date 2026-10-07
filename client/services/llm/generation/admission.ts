import type { LlmConfig, ProviderId } from '../types'
import { getProvider } from '../registry'

export type GenerationTarget = { provider: ProviderId; endpoint: string; model: string }
export type ModelAdmission = GenerationTarget & { evidence: string; batch: string }

/** Added only after the exact browser protocol + complete behavior batch passes.
 * No URL, localStorage, custom-model or provider-level flag can enable a tuple.
 */
export const ADMITTED_GENERATION_MODELS: readonly ModelAdmission[] = []

export function resolveGenerationTarget(config: LlmConfig): GenerationTarget {
  const base = config.baseUrl ?? getProvider(config.provider).baseUrl
  if (!base) throw new Error('This provider has no browser generation endpoint.')
  const url = new URL(`${base.replace(/\/+$/, '')}/chat/completions`)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Generation requires an HTTPS provider endpoint without credentials or query parameters.')
  }
  return { provider: config.provider, endpoint: url.href, model: config.model }
}

export function generationAdmission(target: GenerationTarget): ModelAdmission | undefined {
  return ADMITTED_GENERATION_MODELS.find(item => item.provider === target.provider && item.endpoint === target.endpoint && item.model === target.model)
}

export function assertGenerationAdmission(target: GenerationTarget): void {
  if (!generationAdmission(target)) throw new Error('This exact model and endpoint are awaiting tool and card-behavior verification. Select an admitted model.')
}
