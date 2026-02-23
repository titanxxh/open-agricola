import type { ActionFlow, GameState, PlayerState } from '../../game/types'
import { getMajorCardEffect } from './major'

export type CardEffectHook = 'onBuy' | 'onRoundStart' | 'onHarvest' | 'onRoundEnd'

export type CardEffect = {
  id: string
  onBuy?: (state: GameState, player: PlayerState) => ActionFlow | void
  onRoundStart?: (state: GameState, player: PlayerState) => ActionFlow | void
  onHarvest?: (state: GameState, player: PlayerState) => ActionFlow | void
  onRoundEnd?: (state: GameState, player: PlayerState) => ActionFlow | void
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
