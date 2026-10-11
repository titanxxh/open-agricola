import type { LlmConfig, ProviderId } from '../types'
import { getProvider } from '../registry'

export type GenerationTarget = { provider: ProviderId; endpoint: string; model: string }
export type ModelAdmission = GenerationTarget & { evidence: string; batch: string }

/** Added only after the exact browser protocol + fixed card tests pass.
 * No URL, localStorage, custom-model or provider-level flag can enable a tuple.
 */
export const ADMITTED_GENERATION_MODELS: readonly ModelAdmission[] = [{
  provider: 'deepseek',
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-flash',
  evidence: 'https://github.com/titanxxh/open-agricola/pull/1089#issuecomment-6104006958',
  batch: 'live-2026-10-11T00-27-09-785Z-d1b2ee4c',
}]

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
