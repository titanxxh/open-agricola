import type { CostModifier, PlayerState } from '../contract/types'
import { requireActiveCardRegistry } from './active-registry'

/**
 * Card modifier lookup. Reads from per-session active CardRegistry.
 * GameCore constructor populates modifiersByCard via syncModifiersFromCatalog;
 * custom-registry adds custom-card modifiers at runtime.
 */
export const getCardModifiers = (cardId: string): CostModifier[] => {
  return requireActiveCardRegistry('getCardModifiers').getModifiers(cardId)
}

export const ensureCardModifiers = (player: PlayerState, cardId: string): void => {
  player.activeModifiers ??= []
  const catalogModifiers = getCardModifiers(cardId)
  let replaced = false
  player.activeModifiers = player.activeModifiers.flatMap(modifier => {
    if (modifier.cardId !== cardId) return [modifier]
    if (replaced) return []
    replaced = true
    return catalogModifiers
  })
  if (!replaced) player.activeModifiers.push(...catalogModifiers)
}
