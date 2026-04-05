/**
 * Runtime registry for dynamically loaded custom (workshop) cards.
 *
 * Official cards are discovered via static imports in catalog.ts.
 * Custom cards are registered into a per-session SessionCardContext.
 *
 * The lookup functions here check the current session context first
 * (via getCurrentSessionContext), then fall back to the legacy global maps
 * for backward compatibility with tests that don't use session contexts.
 *
 * catalog.ts lookup functions fall back to this registry when
 * the id starts with "CUSTOM_".
 */
import { MinorImprovement, Occupation, type CardBase } from './types.ts'
import { registerCardEffect, clearCustomCardEffects } from './card-effects.ts'
import { clearCustomCardListeners } from './card-listeners.ts'
import { dslToCardEffect } from './custom-dsl-runner.ts'
import { getCurrentSessionContext, type CustomCardData } from './session-card-context.ts'

// Re-export for backward compatibility
export type { CustomCardData } from './session-card-context.ts'

const customMinorImprovements = new Map<string, CardBase>()
const customOccupations = new Map<string, CardBase>()

/**
 * Register a custom card (and optionally its DSL effects) into the runtime registry.
 * If a SessionCardContext is active, registers there. Otherwise falls back to global maps.
 */
export function registerCustomCard(data: CustomCardData): void {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    sessionCtx.registerCard(data)
    return
  }

  // Legacy global path (for tests without session context)
  const { cardType, cardJson, effectDsl } = data

  const card = cardType === 'minor'
    ? new MinorImprovement(cardJson)
    : new Occupation(cardJson)

  if (cardType === 'minor') {
    customMinorImprovements.set(cardJson.id, card)
  } else {
    customOccupations.set(cardJson.id, card)
  }

  if (effectDsl) {
    try {
      const effect = dslToCardEffect(cardJson.id, effectDsl)
      registerCardEffect(effect)
    } catch (err) {
      console.warn(`[custom-registry] failed to register DSL effect for ${cardJson.id}:`, err)
    }
  }
}

export function getCustomMinorImprovement(id: string): CardBase | null {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    const custom = sessionCtx.getCustomMinor(id)
    if (custom) return custom
  }
  return customMinorImprovements.get(id) ?? null
}

export function getCustomOccupation(id: string): CardBase | null {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    const custom = sessionCtx.getCustomOccupation(id)
    if (custom) return custom
  }
  return customOccupations.get(id) ?? null
}

/** Clear all custom cards — called when creating a fresh game session without workshop cards. */
export function clearCustomCards(): void {
  customMinorImprovements.clear()
  customOccupations.clear()
  clearCustomCardEffects()
  clearCustomCardListeners()
}

export function getCustomMinorImprovementIds(): string[] {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    return sessionCtx.getCustomMinorIds()
  }
  return Array.from(customMinorImprovements.keys())
}

export function getCustomOccupationIds(): string[] {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    return sessionCtx.getCustomOccupationIds()
  }
  return Array.from(customOccupations.keys())
}
