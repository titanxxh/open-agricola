/**
 * Prepares a Workshop card for a browser GameCore. A native Card Source
 * module (ADR 0052) registers its implementation like a built-in card; a
 * draft in the retired sandbox format still runs through the JSON-boundary
 * executor until #1887 removes that format.
 */
import { requireActiveCardRegistry } from '../../shared/cards/active-registry.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import { admitNativeCardSource, isNativeCardSource } from '../../shared/custom-code/card-source-admission.ts'
import { validateAndCompileCustomCodeLocal } from './browser-executor.ts'
import { registerBrowserBackedCustomCard } from './browser-runtime.ts'
import { loadNativeCardSource } from './native-card-source.ts'

export type LocalCardDefinition = CustomCardData['cardJson']

/** Validates and compiles one card; a native source supplies its own definition. */
export function prepareLocalCustomCard(input: {
  cardId: string
  source: string
  cardType?: 'minor' | 'occupation'
  cardJson?: LocalCardDefinition
  artUrl?: string | null
}): CustomCardData {
  if (isNativeCardSource(input.source)) {
    const admission = admitNativeCardSource(input.source, input.cardId)
    if (!admission.valid) throw new Error(admission.errors.join('\n'))
    const card = loadNativeCardSource(input.source, input.cardId)
    return {
      cardType: card.cardType,
      cardJson: { ...card.meta, implemented: true } as LocalCardDefinition,
      effectCode: input.source, compiledCode: null, codeManifest: null, artUrl: input.artUrl ?? null,
    }
  }
  const result = validateAndCompileCustomCodeLocal(input.source, input.cardId)
  if (!result.valid) throw new Error(result.errors.join('\n'))
  if (!input.cardType || !input.cardJson) throw new Error(`Card ${input.cardId} needs its definition`)
  return {
    cardType: input.cardType, cardJson: input.cardJson,
    effectCode: input.source, compiledCode: result.compiledCode, codeManifest: result.manifest, artUrl: input.artUrl ?? null,
  }
}

/** `GameCore.registerCustomCardImpl` for browser sessions. */
export function registerLocalCustomCard(data: CustomCardData): void {
  if (data.effectCode && isNativeCardSource(data.effectCode)) {
    requireActiveCardRegistry('registerLocalCustomCard').loadImpl(data.cardJson.id, loadNativeCardSource(data.effectCode, data.cardJson.id).impl)
    return
  }
  registerBrowserBackedCustomCard(data)
}
