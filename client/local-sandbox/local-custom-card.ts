/**
 * Prepares a Workshop card for a browser GameCore. A native Card Source
 * module (ADR 0052) registers its implementation like a built-in card; the
 * retired CARD_DEF / CARD_IMPL sandbox format no longer runs.
 */
import { requireActiveCardRegistry } from '../../shared/cards/active-registry.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import { admitNativeCardSource, isNativeCardSource, LEGACY_CARD_SOURCE_MESSAGE } from '../../shared/custom-code/card-source-admission.ts'
import { loadNativeCardSource } from './native-card-source.ts'

/** Validates and loads one card; the native source supplies its own definition. */
export function prepareLocalCustomCard(input: {
  cardId: string
  source: string
  artUrl?: string | null
}): CustomCardData {
  if (!isNativeCardSource(input.source)) throw new Error(LEGACY_CARD_SOURCE_MESSAGE)
  const admission = admitNativeCardSource(input.source, input.cardId)
  if (!admission.valid) throw new Error(admission.errors.join('\n'))
  const card = loadNativeCardSource(input.source, input.cardId)
  return {
    cardType: card.cardType,
    cardJson: { ...card.meta, implemented: true } as CustomCardData['cardJson'],
    effectCode: input.source, artUrl: input.artUrl ?? null,
  }
}

/** `GameCore.registerCustomCardImpl` for browser sessions. */
export function registerLocalCustomCard(data: CustomCardData): void {
  if (!data.effectCode) return
  requireActiveCardRegistry('registerLocalCustomCard').loadImpl(data.cardJson.id, loadNativeCardSource(data.effectCode, data.cardJson.id).impl)
}
