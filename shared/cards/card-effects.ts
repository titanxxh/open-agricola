import type { ActionFlow, FarmTilePosition, GameState, PlayerState, Resource } from '../game/types'
import type { AnimalZone } from '../actions/effects/animals'
import type { PlayerScoreSummary, ScoreCategoryResult } from '../logic/scoring'
import { getMajorCardEffect } from './major'
import { getCurrentSessionContext } from './session-card-context'
import { positionKey } from '../game/farm'

/**
 * Extra sowable field contributed by a card (e.g. B72 allows sowing in pastures).
 * The card is responsible for handling the sow result via onSowExtraField.
 */
export type ExtraSowableField = {
  tile: FarmTilePosition
  allowedCrops: ('grain' | 'vegetable' | 'wood')[]
  sourceCard: string
}

export type ExtraSowableCrop = ExtraSowableField['allowedCrops'][number]

export type PaymentInfo = {
  resourcesPaid: Partial<Resource>
  feeIndex?: number
  returnedCardId?: string
}

export type CardEffectHook = 'onBuy' | 'onRoundStart' | 'onHarvest' | 'onRoundEnd' | 'onEndTurn' | 'onReturnHome'
  | 'onBeforeReturnHome' | 'onStartReturnHome'
  | 'onAfterRoundEnd'
  | 'onBeforeHarvest' | 'onStartHarvest'
  | 'onStartHarvestFieldPhase' | 'onHarvestFieldPhase' | 'onEndHarvestFieldPhase'
  | 'onAfterReap'
  | 'onStartHarvestFeedingPhase' | 'onHarvestFeedingPhase' | 'onEndHarvestFeedingPhase'
  | 'onBeforeFeed' | 'onAfterFeed'
  | 'onEndHarvest' | 'onAfterHarvest'
  | 'onBeforeStartOfTurn'
  | 'onAllWorkersPlaced'

export const cardEffectHooks: CardEffectHook[] = [
  'onBuy',
  'onRoundStart',
  'onHarvest',
  'onRoundEnd',
  'onEndTurn',
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
  'onAllWorkersPlaced',
]

type EffectHandler = (state: GameState, player: PlayerState) => void
type FlowEffectHandler = (state: GameState, player: PlayerState) => ActionFlow | void
type FlowEffectHandlerWithPayment = (state: GameState, player: PlayerState, paymentInfo?: PaymentInfo) => ActionFlow | void

/**
 * Mutable context passed through all computeBonusScore handlers during scoring.
 *
 * Cards are processed in scoringPriority order (lower first). Each card greedily
 * takes max resources. This is optimal for the current card set because marginal
 * values are monotonically: DrudgeryReeve (1/2/2) ≥ Soldier (1/1/…) ≥ Major (0-1).
 * If a future card breaks this monotonicity, consider replacing greedy with
 * interactive player choice (matching BGA's BeforeEndOfGame flow).
 */
export type ScoringContext = {
  /** Resources already consumed by prior bonus-scoring cards (e.g. Soldier, DrudgeryReeve). */
  reserved: Partial<Resource>
}

export type BonusScoreHandler = (state: GameState, player: PlayerState, ctx: ScoringContext) => number
export type SharedPostScoreHandler = (
  state: GameState,
  owner: PlayerState,
  summaries: PlayerScoreSummary[],
) => Array<{ playerId: string; score: number }>

export type CardEffect = {
  id: string
  /** Lower values run first in computeBonusScore ordering (default: 100). */
  scoringPriority?: number
  onBuy?: FlowEffectHandlerWithPayment
  onRoundStart?: FlowEffectHandler
  onHarvest?: FlowEffectHandler
  onRoundEnd?: EffectHandler
  onEndTurn?: FlowEffectHandler
  onReturnHome?: FlowEffectHandler
  onBeforeReturnHome?: FlowEffectHandler
  onStartReturnHome?: FlowEffectHandler
  onAfterRoundEnd?: FlowEffectHandler
  onBeforeHarvest?: FlowEffectHandler
  onStartHarvest?: FlowEffectHandler
  onStartHarvestFieldPhase?: FlowEffectHandler
  onHarvestFieldPhase?: FlowEffectHandler
  onEndHarvestFieldPhase?: FlowEffectHandler
  onAfterReap?: FlowEffectHandler
  onStartHarvestFeedingPhase?: FlowEffectHandler
  onHarvestFeedingPhase?: FlowEffectHandler
  onEndHarvestFeedingPhase?: FlowEffectHandler
  onBeforeFeed?: EffectHandler
  onAfterFeed?: EffectHandler
  onEndHarvest?: FlowEffectHandler
  onAfterHarvest?: FlowEffectHandler
  onBeforeStartOfTurn?: FlowEffectHandler
  onAllWorkersPlaced?: FlowEffectHandler
  computeBonusScore?: BonusScoreHandler
  computePostScore?: (state: GameState, player: PlayerState, categories: ScoreCategoryResult[]) => number
  computeSharedPostScore?: SharedPostScoreHandler
  computeExtraRoomCapacity?: (player: PlayerState) => number
  onComputeAnimalZones?: (player: PlayerState, zones: AnimalZone[]) => void
  /** Return extra sowable tiles (e.g. pasture tiles that can be sown). */
  onComputeSowableFields?: (player: PlayerState) => ExtraSowableField[]
  /** Handle sowing into an extra field returned by onComputeSowableFields. */
  onSowExtraField?: (player: PlayerState, tile: FarmTilePosition, crop: ExtraSowableCrop) => boolean
  /** Return farmyard tiles currently locked by this card. Empty = no lock active. */
  computeLockedFarmTiles?: (player: PlayerState) => FarmTilePosition[]
  /** Extra free fence segments granted by a card (e.g. E16 BriarHedge for border edges). */
  computeFenceDiscount?: (
    state: GameState,
    player: PlayerState,
    context: { newFenceEdges: string[]; newPalisadeEdges: string[] },
  ) => number
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

export const getCardEffect = (id: string): CardEffect | null => {
  const sessionCtx = getCurrentSessionContext()
  const custom = sessionCtx?.customEffects.get(id)
  if (custom) return custom
  return cardEffectOverrides.get(id) ?? getMajorCardEffect(id) ?? null
}

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

export type BonusScoreResult = {
  entries: { cardId: string; score: number }[]
  reserved: Partial<Resource>
}

/**
 * Collect bonus VP from all cards that have computeBonusScore.
 * Cards are processed in scoringPriority order (lower = first).
 * A shared ScoringContext tracks reserved resources across cards.
 */
export const collectBonusScores = (
  state: GameState,
  player: PlayerState,
): BonusScoreResult => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  const withEffects = allCards
    .map((cardId) => ({ cardId, effect: getCardEffect(cardId) }))
    .filter((item): item is { cardId: string; effect: CardEffect } =>
      !!item.effect?.computeBonusScore,
    )
    .sort((a, b) => (a.effect.scoringPriority ?? 100) - (b.effect.scoringPriority ?? 100))

  const ctx: ScoringContext = { reserved: {} }
  const entries: { cardId: string; score: number }[] = []

  for (const { cardId, effect } of withEffects) {
    try {
      const score = effect.computeBonusScore!(state, player, ctx)
      if (score > 0) {
        entries.push({ cardId, score })
      }
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} computeBonusScore threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return { entries, reserved: ctx.reserved }
}

export const getExtraRoomCapacity = (player: PlayerState): number => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  let extra = 0
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.computeExtraRoomCapacity) continue
    try {
      extra += effect.computeExtraRoomCapacity(player)
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(`[card-effects] custom card ${cardId} computeExtraRoomCapacity threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return extra
}

/**
 * Collect extra sowable fields from all card effects that have onComputeSowableFields.
 */
export const computeExtraSowableFields = (player: PlayerState): ExtraSowableField[] => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  const extras: ExtraSowableField[] = []
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.onComputeSowableFields) continue
    try {
      extras.push(...effect.onComputeSowableFields(player))
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(`[card-effects] custom card ${cardId} onComputeSowableFields threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return extras
}

export const collectFenceDiscount = (
  state: GameState,
  player: PlayerState,
  context: { newFenceEdges: string[]; newPalisadeEdges: string[] },
): number => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  let total = 0
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.computeFenceDiscount) continue
    try {
      total += effect.computeFenceDiscount(state, player, context)
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} computeFenceDiscount threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return Math.max(0, total)
}

/**
 * Handle sowing into an extra field. Returns true if a card handled the sow.
 */
export const handleSowExtraField = (
  player: PlayerState,
  tile: FarmTilePosition,
  crop: ExtraSowableCrop,
): boolean => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.onSowExtraField) continue
    try {
      if (effect.onSowExtraField(player, tile, crop)) return true
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(`[card-effects] custom card ${cardId} onSowExtraField threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return false
}

/**
 * Collect all locked farmyard tile keys from cards that implement computeLockedFarmTiles.
 * Returns a Set of position keys ("row-col") that are currently locked.
 */
export const collectLockedFarmTileKeys = (player: PlayerState): Set<string> => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  const lockedKeys = new Set<string>()
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.computeLockedFarmTiles) continue
    try {
      const tiles = effect.computeLockedFarmTiles(player)
      tiles.forEach(tile => lockedKeys.add(positionKey(tile)))
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(`[card-effects] custom card ${cardId} computeLockedFarmTiles threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return lockedKeys
}
