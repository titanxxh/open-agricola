import type { CostModifier } from '../contract/types'
import { getActiveCardRegistry } from './active-registry'

/**
 * Card modifier lookup. Reads from per-session active CardRegistry.
 * GameCore constructor populates modifiersByCard via syncModifiersFromCatalog;
 * custom-registry adds custom-card modifiers at runtime.
 */
export const getCardModifiers = (cardId: string): CostModifier[] => {
  return getActiveCardRegistry()?.getModifiers(cardId) ?? []
}
