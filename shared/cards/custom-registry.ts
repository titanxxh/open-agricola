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
import { getActiveCardRegistry } from './active-registry.ts'
import { getCurrentSessionContext, type CustomCardData } from './session-card-context.ts'

// Re-export for backward compatibility
export type { CustomCardData } from './session-card-context.ts'

type RegisterCustomCardOptions = {
  allowGlobal?: boolean
}

const customMinorImprovements = new Map<string, CardBase>()
const customOccupations = new Map<string, CardBase>()
const customArtUrls = new Map<string, string>()
/** Sequential numbering for custom cards: minor O001+, occupation O500+ */
const customNumbering = new Map<string, string>()
let nextMinorNumber = 1
let nextOccupationNumber = 500

/**
 * Register a custom card into the runtime registry.
 * If a SessionCardContext is active, registers there. Otherwise falls back to global maps.
 */
export function registerCustomCard(
  data: CustomCardData,
  options: RegisterCustomCardOptions = {},
): void {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    sessionCtx.registerCard(data)
    return
  }

  if (!options.allowGlobal) {
    console.warn(
      `[custom-registry] registering ${data.cardJson.id} without an active session context; ` +
      'this should be limited to explicit legacy/frontend paths',
    )
  }

  // Legacy global path (for tests without session context, and frontend)
  const { cardType, cardJson, artUrl } = data

  const card = cardType === 'minor'
    ? new MinorImprovement(cardJson)
    : new Occupation(cardJson)

  if (cardType === 'minor') {
    customMinorImprovements.set(cardJson.id, card)
    if (!customNumbering.has(cardJson.id)) {
      customNumbering.set(cardJson.id, `O${String(nextMinorNumber++).padStart(3, '0')}`)
    }
  } else {
    customOccupations.set(cardJson.id, card)
    if (!customNumbering.has(cardJson.id)) {
      customNumbering.set(cardJson.id, `O${String(nextOccupationNumber++).padStart(3, '0')}`)
    }
  }

  if (artUrl) {
    customArtUrls.set(cardJson.id, artUrl)
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

/** Get the O-series numbering for a custom card (e.g. "O001", "O500"), or null. */
export function getCustomCardNumbering(id: string): string | null {
  return customNumbering.get(id) ?? null
}

/** Get the art URL for a custom card, or null if none. */
export function getCustomCardArtUrl(id: string): string | null {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    const url = sessionCtx.customArtUrls.get(id)
    if (url) return url
  }
  return customArtUrls.get(id) ?? null
}

/** Clear all custom cards — called when creating a fresh game session without workshop cards. */
export function clearCustomCards(): void {
  customMinorImprovements.clear()
  customOccupations.clear()
  customArtUrls.clear()
  customNumbering.clear()
  nextMinorNumber = 1
  nextOccupationNumber = 500
  const active = getActiveCardRegistry()
  if (active) {
    active.removeEffectsWhere((id) => id.startsWith('CUSTOM_'))
    active.removeListenersWhere((reg) => reg.id.startsWith('CUSTOM_'))
  }
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
