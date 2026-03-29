/**
 * Runtime registry for dynamically loaded custom (workshop) cards.
 *
 * Official cards are discovered via static imports in catalog.ts.
 * Custom cards are registered here at game-session creation time,
 * when the server loads them from the database.
 *
 * catalog.ts lookup functions fall back to this registry when
 * the id starts with "CUSTOM_".
 */
import { MinorImprovement, Occupation, type CardBase } from './types.ts'
import type { CardDefinition } from './types.ts'
import { registerCardEffect } from './card-effects.ts'
import { dslToCardEffect, type CardDslEffects } from './custom-dsl-runner.ts'

const customMinorImprovements = new Map<string, CardBase>()
const customOccupations = new Map<string, CardBase>()

export type CustomCardData = {
  cardType: 'minor' | 'occupation'
  cardJson: CardDefinition
  effectDsl?: CardDslEffects | null
  compiledCode?: string | null
  /** Set to true when card was loaded from a .ts file (effects already registered by import). */
  loadedFromFile?: boolean
}

/**
 * Register a custom card (and optionally its DSL effects) into the runtime registry.
 * Called by GameSession when loading a room that has workshop cards enabled.
 */
export function registerCustomCard(data: CustomCardData): void {
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
  return customMinorImprovements.get(id) ?? null
}

export function getCustomOccupation(id: string): CardBase | null {
  return customOccupations.get(id) ?? null
}

/** Clear all custom cards — called when creating a fresh game session without workshop cards. */
export function clearCustomCards(): void {
  customMinorImprovements.clear()
  customOccupations.clear()
}

export function getCustomMinorImprovementIds(): string[] {
  return Array.from(customMinorImprovements.keys())
}

export function getCustomOccupationIds(): string[] {
  return Array.from(customOccupations.keys())
}
