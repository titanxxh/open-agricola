/**
 * Runtime registry for dynamically loaded custom (workshop) cards.
 *
 * Official cards are discovered via static imports in catalog.ts.
 * Custom cards are registered into a per-session SessionCardContext.
 *
 * The lookup functions here check the current session context first
 * (via getCurrentSessionContext), then fall back to the explicit global maps
 * for tests and frontend paths that don't use session contexts.
 *
 * catalog.ts lookup functions fall back to this registry when
 * the id starts with "CUSTOM_".
 */
import { getActiveCardRegistry } from './active-registry.ts'
import type { CardRegistry } from './registry.ts'
import { getCurrentSessionContext, type CustomCardData } from './session-card-context.ts'
import type { CardDefinition } from '../contract/cards'
import type { CostModifier } from '../contract/types'

// Re-export for backward compatibility
export type { CustomCardData } from './session-card-context.ts'

type RegisterCustomCardOptions = {
  allowGlobal?: boolean
}

const customMinorImprovements = new Map<string, CardDefinition>()
const customOccupations = new Map<string, CardDefinition>()
const isCustomCardId = (id: string): boolean => id.startsWith('CUSTOM_')

type LegacyCardJson = CardDefinition & {
  modifier?: CostModifier
  modifiers?: CostModifier[]
}

const displayOnlyCardJson = (cardJson: LegacyCardJson): CardDefinition => {
  const { modifier: _modifier, modifiers: _modifiers, ...display } = cardJson
  return display
}

export function clearCustomCardRuntimeFromRegistry(registry: CardRegistry): void {
  for (const id of registry.snapshot().cardIds) {
    if (isCustomCardId(id)) registry.unload(id)
  }
  registry.removeEffectsWhere(isCustomCardId)
  registry.removeListenersWhere((reg) =>
    isCustomCardId(reg.id) || (reg.cardIds ?? []).some(isCustomCardId),
  )
}

/**
 * Register a custom card into the runtime registry.
 * If a SessionCardContext is active, registers there. Otherwise falls back to global maps.
 */
export function registerCustomCard(
  data: CustomCardData,
  options: RegisterCustomCardOptions = {},
): void {
  // Inject modifier / modifiers into the active per-session CardRegistry so
  // getCardModifiers (which reads only from the active registry post-D1)
  // resolves the same data as built-in occupation/minor cards. Custom cards
  // are not part of the catalog arrays passed to syncModifiersFromCatalog,
  // so this runtime injection is the dedicated path for them.
  const active = getActiveCardRegistry()
  if (active) {
    const { id, modifier, modifiers } = data.cardJson as LegacyCardJson
    const allMods = [
      ...(modifiers ?? []),
      ...(modifier ? [modifier] : []),
    ]
    if (allMods.length > 0) {
      active.setModifiersForCard(id, allMods)
    }
  }

  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    sessionCtx.registerCard(data)
    return
  }

  if (!options.allowGlobal) {
    console.warn(
      `[custom-registry] registering ${data.cardJson.id} without an active session context; ` +
      'this should be limited to explicit global/frontend paths',
    )
  }

  // Explicit global path for tests without session context.
  const { cardType, cardJson } = data
  const card = displayOnlyCardJson(cardJson as LegacyCardJson)

  if (cardType === 'minor') {
    customMinorImprovements.set(cardJson.id, card)
  } else {
    customOccupations.set(cardJson.id, card)
  }
}

export function getCustomMinorImprovement(id: string): CardDefinition | null {
  const sessionCtx = getCurrentSessionContext()
  if (sessionCtx) {
    const custom = sessionCtx.getCustomMinor(id)
    if (custom) return custom
  }
  return customMinorImprovements.get(id) ?? null
}

export function getCustomOccupation(id: string): CardDefinition | null {
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
  const active = getActiveCardRegistry()
  if (active) {
    clearCustomCardRuntimeFromRegistry(active)
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
