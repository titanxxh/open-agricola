import type { ActionFlow, GameState, PlayerState, Resource } from '../game/types'
import { getMajorCardEffect } from './major'

export type PaymentInfo = {
  resourcesPaid: Partial<Resource>
  feeIndex?: number
}

export type CardEffectHook = 'onBuy' | 'onRoundStart' | 'onHarvest' | 'onRoundEnd' | 'onReturnHome'
  | 'onBeforeReturnHome' | 'onStartReturnHome'
  | 'onAfterRoundEnd'
  | 'onBeforeHarvest' | 'onStartHarvest'
  | 'onStartHarvestFieldPhase' | 'onHarvestFieldPhase' | 'onEndHarvestFieldPhase'
  | 'onAfterReap'
  | 'onStartHarvestFeedingPhase' | 'onHarvestFeedingPhase' | 'onEndHarvestFeedingPhase'
  | 'onBeforeFeed' | 'onAfterFeed'
  | 'onEndHarvest' | 'onAfterHarvest'
  | 'onBeforeStartOfTurn'

type EffectHandler = (state: GameState, player: PlayerState) => void
type FlowEffectHandler = (state: GameState, player: PlayerState) => ActionFlow | void
type FlowEffectHandlerWithPayment = (state: GameState, player: PlayerState, paymentInfo?: PaymentInfo) => ActionFlow | void

export type CardEffect = {
  id: string
  onBuy?: FlowEffectHandlerWithPayment
  onRoundStart?: FlowEffectHandler
  onHarvest?: FlowEffectHandler
  onRoundEnd?: EffectHandler
  onReturnHome?: FlowEffectHandler
  onBeforeReturnHome?: EffectHandler
  onStartReturnHome?: EffectHandler
  onAfterRoundEnd?: EffectHandler
  onBeforeHarvest?: FlowEffectHandler
  onStartHarvest?: EffectHandler
  onStartHarvestFieldPhase?: EffectHandler
  onHarvestFieldPhase?: EffectHandler
  onEndHarvestFieldPhase?: EffectHandler
  onAfterReap?: EffectHandler
  onStartHarvestFeedingPhase?: EffectHandler
  onHarvestFeedingPhase?: EffectHandler
  onEndHarvestFeedingPhase?: EffectHandler
  onBeforeFeed?: EffectHandler
  onAfterFeed?: EffectHandler
  onEndHarvest?: EffectHandler
  onAfterHarvest?: FlowEffectHandler
  onBeforeStartOfTurn?: FlowEffectHandler
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
  paymentInfo?: PaymentInfo,
): ActionFlow | null => {
  const effect = getCardEffect(cardId)
  const handler = effect?.[hook]
  if (!handler) return null
  if (hook === 'onBuy') {
    return (handler as FlowEffectHandlerWithPayment)(state, player, paymentInfo) ?? null
  }
  return (handler as FlowEffectHandler)(state, player) ?? null
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

export const runRoundEndHooks = (state: GameState, player: PlayerState): void => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (effect?.onRoundEnd) {
      effect.onRoundEnd(state, player)
    }
  }
}

const runHookForAllCards = (
  state: GameState,
  player: PlayerState,
  hookName: keyof CardEffect,
): void => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    const handler = effect?.[hookName] as ((s: GameState, p: PlayerState) => void) | undefined
    if (handler) handler(state, player)
  }
}

export const runBeforeHarvestHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onBeforeHarvest')

export const runAfterReapHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onAfterReap')

export const runBeforeFeedHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onBeforeFeed')

export const runAfterFeedHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onAfterFeed')

export const runAfterHarvestHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onAfterHarvest')

export const runBeforeStartOfTurnHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onBeforeStartOfTurn')

export const runBeforeReturnHomeHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onBeforeReturnHome')

export const runStartReturnHomeHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onStartReturnHome')

export const runAfterRoundEndHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onAfterRoundEnd')

export const runStartHarvestHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onStartHarvest')

export const runStartHarvestFieldPhaseHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onStartHarvestFieldPhase')

export const runHarvestFieldPhaseHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onHarvestFieldPhase')

export const runEndHarvestFieldPhaseHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onEndHarvestFieldPhase')

export const runStartHarvestFeedingPhaseHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onStartHarvestFeedingPhase')

export const runHarvestFeedingPhaseHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onHarvestFeedingPhase')

export const runEndHarvestFeedingPhaseHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onEndHarvestFeedingPhase')

export const runEndHarvestHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onEndHarvest')
