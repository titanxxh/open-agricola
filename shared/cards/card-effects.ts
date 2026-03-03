import type { ActionFlow, GameState, PlayerState } from '../../game/types'
import { getMajorCardEffect } from './major'

export type CardEffectHook = 'onBuy' | 'onRoundStart' | 'onHarvest' | 'onRoundEnd' | 'onReturnHome'

export type CardEffect = {
  id: string
  onBuy?: (state: GameState, player: PlayerState) => ActionFlow | void
  onRoundStart?: (state: GameState, player: PlayerState) => ActionFlow | void
  onHarvest?: (state: GameState, player: PlayerState) => ActionFlow | void
  onRoundEnd?: (state: GameState, player: PlayerState) => ActionFlow | void
  onReturnHome?: (state: GameState, player: PlayerState) => void
}

const cardEffectOverrides = new Map<string, CardEffect>()

export const registerCardEffect = (effect: CardEffect) => {
  cardEffectOverrides.set(effect.id, effect)
}

export const clearCardEffects = () => {
  cardEffectOverrides.clear()
}

export const getCardEffect = (id: string): CardEffect | null =>
  cardEffectOverrides.get(id) ?? getMajorCardEffect(id) ?? null

export const runCardEffectHook = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  hook: CardEffectHook,
): ActionFlow | null => {
  const effect = getCardEffect(cardId)
  const handler = effect?.[hook]
  if (!handler) return null
  return handler(state, player) ?? null
}

/**
 * Run onReturnHome hook for a player's cards that have it.
 * This is called during the returning home phase.
 */
export const runReturnHomeHooks = (state: GameState, player: PlayerState): void => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (effect?.onReturnHome) {
      effect.onReturnHome(state, player)
    }
  }
}
