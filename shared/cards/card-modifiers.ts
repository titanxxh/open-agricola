import type { CostModifier, PlayerState } from '../contract/types'
import { getActiveCardRegistry } from './active-registry'

/**
 * Card modifier lookup. Reads from per-session active CardRegistry.
 * GameCore constructor populates modifiersByCard via syncModifiersFromCatalog;
 * custom-registry adds custom-card modifiers at runtime.
 */
export const getCardModifiers = (cardId: string): CostModifier[] => {
  return getActiveCardRegistry()?.getModifiers(cardId) ?? []
}

export const ensureCardModifiers = (player: PlayerState, cardId: string): void => {
  player.activeModifiers ??= []
  const remaining = new Map<string, number>()
  for (const modifier of player.activeModifiers) {
    const key = JSON.stringify(modifier)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }
  for (const modifier of getCardModifiers(cardId)) {
    const key = JSON.stringify(modifier)
    const count = remaining.get(key) ?? 0
    if (count > 0) remaining.set(key, count - 1)
    else player.activeModifiers.push(modifier)
  }
}
