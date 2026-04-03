import type { ActionFlow, GameState, PlayerState, Resource } from '../game/types'
import { getMajorCardEffect } from './major'

export type PaymentInfo = {
  resourcesPaid: Partial<Resource>
  feeIndex?: number
  returnedCardId?: string
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

export const cardEffectHooks: CardEffectHook[] = [
  'onBuy',
  'onRoundStart',
  'onHarvest',
  'onRoundEnd',
  'onReturnHome',
  'onBeforeReturnHome',
  'onStartReturnHome',
  'onAfterRoundEnd',
  'onBeforeHarvest',
  'onStartHarvest',
  'onStartHarvestFieldPhase',
  'onHarvestFieldPhase',
  'onEndHarvestFieldPhase',
  'onAfterReap',
  'onStartHarvestFeedingPhase',
  'onHarvestFeedingPhase',
  'onEndHarvestFeedingPhase',
  'onBeforeFeed',
  'onAfterFeed',
  'onEndHarvest',
  'onAfterHarvest',
  'onBeforeStartOfTurn',
]

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
  onAfterReap?: FlowEffectHandler
  onStartHarvestFeedingPhase?: FlowEffectHandler
  onHarvestFeedingPhase?: EffectHandler
  onEndHarvestFeedingPhase?: EffectHandler
  onBeforeFeed?: EffectHandler
  onAfterFeed?: EffectHandler
  onEndHarvest?: FlowEffectHandler
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

export const clearCustomCardEffects = () => {
  for (const id of [...cardEffectOverrides.keys()]) {
    if (id.startsWith('CUSTOM_')) {
      cardEffectOverrides.delete(id)
    }
  }
}

export const getCardEffect = (id: string): CardEffect | null =>
  cardEffectOverrides.get(id) ?? getMajorCardEffect(id) ?? null

const isCustomCard = (id: string) => id.startsWith('CUSTOM_')

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
  try {
    if (hook === 'onBuy') {
      return (handler as FlowEffectHandlerWithPayment)(state, player, paymentInfo) ?? null
    }
    return (handler as FlowEffectHandler)(state, player) ?? null
  } catch (err) {
    if (isCustomCard(cardId)) {
      console.warn(`[card-effects] custom card ${cardId} hook "${hook}" threw, skipping:`, err)
      return null
    }
    throw err
  }
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
      try {
        effect.onReturnHome(state, player)
      } catch (err) {
        if (isCustomCard(cardId)) {
          console.warn(`[card-effects] custom card ${cardId} onReturnHome threw, skipping:`, err)
          continue
        }
        throw err
      }
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
      try {
        effect.onRoundEnd(state, player)
      } catch (err) {
        if (isCustomCard(cardId)) {
          console.warn(`[card-effects] custom card ${cardId} onRoundEnd threw, skipping:`, err)
          continue
        }
        throw err
      }
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
    if (handler) {
      try {
        handler(state, player)
      } catch (err) {
        if (isCustomCard(cardId)) {
          console.warn(`[card-effects] custom card ${cardId} hook "${hookName}" threw, skipping:`, err)
          continue
        }
        throw err
      }
    }
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
