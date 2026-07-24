/**
 * Per-session overlay registry for custom (workshop) cards.
 *
 * Official cards live in the global registries (card-effects.ts, card-listeners.ts)
 * and are immutable after startup. Custom cards need per-session isolation so that
 * concurrent sandbox games don't bleed into each other.
 *
 * Design: "union mount" — lookup functions check the current session context first,
 * then fall back to the global registry. This avoids changing 100+ card module files.
 *
 * Since the game engine is fully synchronous, we use a simple module-level variable
 * (withSessionContext / getCurrentSessionContext) rather than AsyncLocalStorage.
 */
import type { CardEffect } from './card-effects.ts'
import type { CardListenerRegistration } from './card-listeners.ts'
import type { CardDefinition } from '../contract/cards'
import type { CustomCodeManifest } from '../custom-code/types.ts'
import type { CostModifier } from '../contract/types.ts'

// ── Custom card data type (moved from custom-registry.ts) ───────────────────

export type CustomCardData = {
  cardType: 'minor' | 'occupation'
  cardJson: CardDefinition & {
    modifier?: CostModifier
    modifiers?: CostModifier[]
  }
  effectCode?: string | null
  compiledCode?: string | null
  codeManifest?: CustomCodeManifest | null
  artUrl?: string | null
}

const displayOnlyCardJson = (cardJson: CustomCardData['cardJson']): CardDefinition => {
  const { modifier: _modifier, modifiers: _modifiers, ...display } = cardJson
  return display
}

// ── Session context class ───────────────────────────────────────────────────

export class SessionCardContext {
  readonly customEffects = new Map<string, CardEffect>()
  readonly customListeners: CardListenerRegistration[] = []
  readonly customMinors = new Map<string, CardDefinition>()
  readonly customOccupations = new Map<string, CardDefinition>()
  /** Art URLs for custom cards, keyed by card ID. */
  readonly customArtUrls = new Map<string, string>()
  private readonly warnings: string[]

  constructor(warnings: string[] = []) {
    this.warnings = warnings
  }

  reportWarning(warning: string): void {
    if (!this.warnings.includes(warning)) this.warnings.push(warning)
  }

  registerEffect(effect: CardEffect): void {
    this.customEffects.set(effect.id, effect)
  }

  registerListener(reg: CardListenerRegistration): void {
    this.customListeners.push(reg)
  }

  registerCard(data: CustomCardData): void {
    const { cardType, cardJson, artUrl } = data
    const card = displayOnlyCardJson(cardJson)

    if (cardType === 'minor') {
      this.customMinors.set(cardJson.id, card)
    } else {
      this.customOccupations.set(cardJson.id, card)
    }

    if (artUrl) {
      this.customArtUrls.set(cardJson.id, artUrl)
    }
  }

  getCustomMinor(id: string): CardDefinition | null {
    return this.customMinors.get(id) ?? null
  }

  getCustomOccupation(id: string): CardDefinition | null {
    return this.customOccupations.get(id) ?? null
  }

  getCustomMinorIds(): string[] {
    return Array.from(this.customMinors.keys())
  }

  getCustomOccupationIds(): string[] {
    return Array.from(this.customOccupations.keys())
  }

  dispose(): void {
    this.customEffects.clear()
    this.customListeners.length = 0
    this.customMinors.clear()
    this.customOccupations.clear()
    this.customArtUrls.clear()
    this.warnings.length = 0
  }
}

// ── Context scoping ─────────────────────────────────────────────────────────

let currentSessionContext: SessionCardContext | null = null

/**
 * Run `fn` with the given session context active.
 * All card lookup functions will check this context first.
 * Safe because the game engine is fully synchronous.
 */
export function withSessionContext<T>(ctx: SessionCardContext | null, fn: () => T): T {
  const prev = currentSessionContext
  currentSessionContext = ctx
  try {
    return fn()
  } finally {
    currentSessionContext = prev
  }
}

/**
 * Get the currently active session context, or null if none.
 * Called by lookup functions in card-effects.ts and card-listeners.ts.
 */
export function getCurrentSessionContext(): SessionCardContext | null {
  return currentSessionContext
}
