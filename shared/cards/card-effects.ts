import type { ActionFlow, FarmTilePosition, GameState, Pasture, PaymentResourceMap, PlayerState, Resource } from '../contract/types'
import type { PrivateGameEvent } from '../contract/private-events'
import type { AnimalZone, PlayerScoreSummary, ScoreCategoryResult } from '../domain'
import { getCurrentSessionContext } from './session-card-context'
import { getActiveCardRegistry } from './active-registry'
import { positionKey } from '../domain/farm'

/**
 * Extra sowable field contributed by a card (e.g. B72 allows sowing in pastures).
 * The card is responsible for handling the sow result via onSowExtraField.
 */
export type ExtraSowableField = {
  tile: FarmTilePosition
  allowedCrops: ('grain' | 'vegetable' | 'wood' | 'stone')[]
  sourceCard: string
  groupKey?: string
}

export type ExtraSowableCrop = ExtraSowableField['allowedCrops'][number]

/**
 * Lightweight meeple shape consumed by `getInvalidAnimals`. Our model
 * aggregates animals as `(animalType, animalCount)` per zone; per-meeple
 * validation expands the aggregate into a list of these stubs so card
 * authors can mirror BGA's `foreach($zone['meeples'] as $meeple)` loop.
 */
export type Meeple = {
  type: 'sheep' | 'boar' | 'cattle'
}

export type BreedAnimalType = 'sheep' | 'boar' | 'cattle'

export type BreedThresholdContext = {
  sourceCard: string
}

export type BreedThresholdHandler = (
  state: GameState,
  player: PlayerState,
  animalType: BreedAnimalType,
  ctx: BreedThresholdContext,
) => number | undefined

export type PastureCapacityContext = {
  player: PlayerState
  state: GameState
  pasture: Pasture
  pastureIndex: number
}

export type PastureCapacityModifier = {
  sourceCard: string
  kind: 'replacement' | 'additive'
  appliesTo?: (ctx: PastureCapacityContext) => boolean
  apply: (capacity: number, ctx: PastureCapacityContext) => number
}

export type PaymentInfo = {
  resourcesPaid: PaymentResourceMap
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
  | 'onEndHarvest' | 'onAfterHarvest'
  | 'onBeforeEndGame'
  | 'onBeforeStartOfTurn'
  | 'onBeforePlayerTurn'
  | 'onAllWorkersPlaced'

export type FlowCardEffectHook = Exclude<CardEffectHook, 'onBeforePlayerTurn'>

export const flowCardEffectHooks: FlowCardEffectHook[] = [
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
  'onEndHarvest',
  'onAfterHarvest',
  'onBeforeEndGame',
  'onBeforeStartOfTurn',
  'onAllWorkersPlaced',
]

/**
 * All function-type fields on CardEffect that the custom-card sandbox is allowed
 * to define.  This is a superset of CardEffectHook: it also includes hooks with
 * non-standard signatures (scoring, animal zones, sowing, etc.) that cannot be
 * invoked via the generic `runCardEffectHook()` path.
 *
 * `handHooks` (meta-field) and engine-internal adjuncts such as
 * `countExtraTurns` are deliberately excluded.
 */
export type CardEffectField = CardEffectHook
  | 'resolveChoice'
  | 'contributeExtraTurn'
  | 'computeBonusScore' | 'computeSharedPostScore' | 'computeCostedBonus'
  | 'computeExtraRoomCapacity'
  | 'onComputeAnimalZones' | 'onComputeSowableFields' | 'onSowExtraField'
  | 'computeLockedFarmTiles'
  | 'getInvalidAnimals'
  | 'getSpecialStablePositions' | 'applySpecialStable' | 'getBuiltSpecialStables'

export const cardEffectHooks: CardEffectField[] = [
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
  'onEndHarvest',
  'onAfterHarvest',
  'onBeforeEndGame',
  'onBeforeStartOfTurn',
  'onBeforePlayerTurn',
  'onAllWorkersPlaced',
  'resolveChoice',
  'contributeExtraTurn',
  'computeBonusScore',
  'computeSharedPostScore',
  'computeCostedBonus',
  'computeExtraRoomCapacity',
  'onComputeAnimalZones',
  'onComputeSowableFields',
  'onSowExtraField',
  'computeLockedFarmTiles',
  'getInvalidAnimals',
  'getSpecialStablePositions',
  'applySpecialStable',
  'getBuiltSpecialStables',
]

type FlowEffectHandler = (state: GameState, player: PlayerState) => ActionFlow | void
type FlowEffectHandlerWithPayment = (state: GameState, player: PlayerState, paymentInfo?: PaymentInfo) => ActionFlow | void
export type BeforeEndGameScope = 'owner' | 'allPlayers'
export type BeforeEndGameDispatchMode = 'serial' | 'select'

export type ResolveChoiceHandler = (
  state: GameState,
  player: PlayerState,
  choice: string,
  ctx: {
    sourceCard: string
    actionContext?: Record<string, unknown>
    emitPrivateEvent?: (event: PrivateGameEvent) => void
  },
) => ActionFlow | void

/** A discrete (cost, score) option offered by a costed bonus card.
 *  Solver picks at most one level per card; pays `cost`, awards `score` VP. */
export type BonusScoreLevel = {
  cost: Partial<Resource>
  score: number
}

/** Read-only context passed to bonus-scoring handlers.
 *  Standard categories (fields/pastures/.../cards) are already computed. */
export type BonusScoringContext = {
  categories: readonly ScoreCategoryResult[]
}

/** Returns the discrete tier menu this card offers, given current scoring categories.
 *  The solver finds the Pareto-optimal assignment across all costed-bonus cards. */
export type CostedBonusHandler = (
  state: GameState,
  player: PlayerState,
  ctx: BonusScoringContext,
) => BonusScoreLevel[]

export type BonusScoreHandler = (state: GameState, player: PlayerState, ctx: BonusScoringContext) => number
export type SharedPostScoreHandler = (
  state: GameState,
  owner: PlayerState,
  summaries: PlayerScoreSummary[],
) => Array<{ playerId: string; score: number }>

export type CardEffect = {
  id: string
  onBuy?: FlowEffectHandlerWithPayment
  /** Fires when a pending `choice` whose sourceCard is this card is resolved.
   *  If the handler returns an ActionFlow, it is inserted as the next engine node. */
  resolveChoice?: ResolveChoiceHandler
  /**
   * Turn-rotation extra-action hook. Returns an `ActionFlow` (typically an
   * XOR `[use, forfeit]`) when this card can still grant `player` an extra
   * placement this round, or `void` when it cannot. Consumed actively by the
   * round-rotation gating in `shared/session/phases/round.ts` (NOT auto-run
   * via `runCardEffectHook`): it both decides whether the rotation may stop on
   * an out-of-workers player (`hasPendingExtraTurn`) and produces the flow
   * pushed to that player. Single source of truth so gating and flow cannot
   * drift. First introduced for A92 AdoptiveParents; reusable by any card that
   * wants to earn a turn-rotation extra action.
   */
  contributeExtraTurn?: (state: GameState, player: PlayerState) => ActionFlow | void
  countExtraTurns?: (state: GameState, player: PlayerState) => number
  onRoundStart?: FlowEffectHandler
  onHarvest?: FlowEffectHandler
  onRoundEnd?: FlowEffectHandler
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
  onEndHarvest?: FlowEffectHandler
  onAfterHarvest?: FlowEffectHandler
  /** Runs once at the start of scoring, before any category computation.
   *  Use to mutate state (e.g. give resources) so categories see them. */
  onBeforeEndGame?: FlowEffectHandler
  onBeforeStartOfTurn?: FlowEffectHandler
  /**
   * Fires immediately before control switches to a new active player at the
   * start of their labor turn. If any handler returns `{ skipTurn: true }`,
   * `GameCore` skips that player's turn and advances to the next eligible
   * player. Mirrors BGA `Globals::setSkipNext` consumed in `stLabor()`.
   *
   * Note: this is per-labor-turn (every `confirmNextPlayer`), distinct from
   * `onBeforeStartOfTurn` which fires once per round at round start.
   */
  onBeforePlayerTurn?: (state: GameState, player: PlayerState) => { skipTurn?: boolean } | void
  onAllWorkersPlaced?: FlowEffectHandler
  computeBonusScore?: BonusScoreHandler
  computeCostedBonus?: CostedBonusHandler
  computeSharedPostScore?: SharedPostScoreHandler
  computeExtraRoomCapacity?: (player: PlayerState) => number
  computePastureCapacityModifiers?: (
    player: PlayerState,
    state: GameState,
  ) => PastureCapacityModifier[]
  computeBreedThreshold?: BreedThresholdHandler
  onComputeAnimalZones?: (
    player: PlayerState,
    zones: AnimalZone[],
    state: GameState,
  ) => void | AnimalZone[]
  /**
   * Per-card zone validation. Mirrors BGA `getInvalidAnimals($zone, $raise)`.
   * Given the meeples currently in a card-owned zone, return the subset that
   * violates this card's per-type / per-cap constraints. The reorg / capacity
   * enforcement path consumes the result to evict invalid animals.
   *
   * Caller is `enforceAnimalCapacity` for any card-typed zone whose owner
   * declares this hook. If unset, only the zone's static `capacity` field is
   * applied (legacy behavior).
   */
  getInvalidAnimals?: (
    player: PlayerState,
    zone: AnimalZone,
    meeples: Meeple[],
    state: GameState,
  ) => Meeple[]
  /** Return extra sowable tiles (e.g. pasture tiles that can be sown). */
  onComputeSowableFields?: (player: PlayerState) => ExtraSowableField[]
  /** Handle sowing into an extra field returned by onComputeSowableFields. */
  onSowExtraField?: (player: PlayerState, tile: FarmTilePosition, crop: ExtraSowableCrop) => boolean
  /** Return farmyard tiles currently locked by this card. Empty = no lock active. */
  computeLockedFarmTiles?: (player: PlayerState) => FarmTilePosition[]
  /**
   * Extra "special" stable tiles this card lets the player build during a
   * Farm-Expansion Build Stables `farm-select` (e.g. B85 FarmHand's 2×2 field
   * centre). These join the regular stable selection via the `farmHandPositions`
   * protocol field but are settled by the owning card, not the ordinary
   * `stableTiles` path. Only consulted at the farm-expansion stables entry.
   */
  getSpecialStablePositions?: (state: GameState, player: PlayerState) => FarmTilePosition[]
  /**
   * Settle one special stable returned by `getSpecialStablePositions`. Mutates
   * the player (flags / card state) and returns true on success, false when the
   * position is not a legal candidate for this card.
   */
  applySpecialStable?: (state: GameState, player: PlayerState, position: FarmTilePosition) => boolean
  /**
   * Currently-standing special stable tiles this card has built (e.g. B85
   * FarmHand's 2×2 field centre). Empty until built, and empty again after the
   * tile is returned (D102 / E76). Drives the generic snapshot `specialStables`
   * display field so the client can render the built stable without reading any
   * single card's `cardStates`.
   */
  getBuiltSpecialStables?: (player: PlayerState) => FarmTilePosition[]
  /**
   * BGA `enforceReorganizeOnLastHarvest`: cards like B104 SheepWalker, B35
   * HookKnife, A153 PigOwner force an animal reorg on the round-14 harvest
   * even when no breeding produced a newborn — to give the rules system a
   * chance to evict animals (e.g. SheepWalker's "must accommodate before
   * exchange" implies the final-harvest rearrangement). Returning true makes
   * `breedAction` emit an `animalReorg` result regardless of `animalCount`.
   * Only consulted when `state.round === 14` and `sourceCard === 'harvest'`.
   */
  enforceReorganizeOnLastHarvest?: (state: GameState, player: PlayerState) => boolean
  /**
   * Declare which hooks should also fire when the card is still in the player's hand
   * (not yet played). The framework iterates hand cards separately from played cards,
   * so there is no overlap — once a card is played it moves out of the hand arrays
   * and into the played arrays, and only the normal hook path applies.
   */
  handHooks?: CardEffectHook[]
  beforeEndGameScope?: BeforeEndGameScope
  beforeEndGameDispatchMode?: BeforeEndGameDispatchMode
  beforeEndGameMandatory?: boolean
}

export const getCardEffect = (id: string): CardEffect | null => {
  const sessionCtx = getCurrentSessionContext()
  const custom = sessionCtx?.customEffects.get(id)
  if (custom) return custom
  const active = getActiveCardRegistry()
  return active?.getEffect(id) ?? null
}

const isCustomCard = (id: string) => id.startsWith('CUSTOM_')

export const runCardEffectHook = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  hook: FlowCardEffectHook,
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

export const runBeforeEndGameHooks = (state: GameState, player: PlayerState): void =>
  runHookForAllCards(state, player, 'onBeforeEndGame')

/**
 * Returns true when any of the player's played cards demand a reorg even on
 * the round-14 harvest with no newborn (e.g. B104 SheepWalker, B35 HookKnife,
 * A153 PigOwner). Mirrors BGA's `enforceReorganizeOnLastHarvest` aggregation
 * in `HarvestTrait::stHarvestBreed`.
 */
export const shouldEnforceReorganizeOnLastHarvest = (
  state: GameState,
  player: PlayerState,
): boolean => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    const handler = effect?.enforceReorganizeOnLastHarvest
    if (!handler) continue
    try {
      if (handler(state, player)) return true
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(
          `[card-effects] custom card ${cardId} enforceReorganizeOnLastHarvest threw, skipping:`,
          err,
        )
        continue
      }
      throw err
    }
  }
  return false
}

export const getBreedThreshold = (
  state: GameState,
  player: PlayerState,
  animalType: BreedAnimalType,
  ctx: BreedThresholdContext,
): number => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  let threshold = 2
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    const handler = effect?.computeBreedThreshold
    if (!handler) continue
    try {
      const next = handler(state, player, animalType, ctx)
      if (typeof next !== 'number' || Number.isNaN(next)) continue
      threshold = Math.min(threshold, Math.max(1, Math.floor(next)))
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} computeBreedThreshold threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return threshold
}

/**
 * Run `onBeforePlayerTurn` listeners for every card the player owns and return
 * `true` if any handler asked to skip the turn. Hooks are not allowed to push
 * an ActionFlow here — only to signal skipTurn. Errors from custom cards are
 * swallowed (consistent with other hook helpers).
 */
export const shouldSkipPlayerTurn = (state: GameState, player: PlayerState): boolean => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  let skip = false
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    const handler = effect?.onBeforePlayerTurn
    if (!handler) continue
    try {
      const result = handler(state, player)
      if (result && result.skipTurn) skip = true
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} onBeforePlayerTurn threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return skip
}

/**
 * Collect the first turn-rotation extra-action flow a player's played cards
 * can contribute this turn (e.g. A92 AdoptiveParents' `XOR[use, forfeit]`).
 * Returns the flow plus the owning card id, or `null` when no card contributes.
 * This is the single source of truth consumed by the round-rotation gating in
 * `round.ts`: both the "may the rotation stop on this 0-worker player" decision
 * and the flow pushed to them come from the same `contributeExtraTurn` hook, so
 * they cannot drift. Errors from custom cards are swallowed (consistent with
 * the other hook aggregators here).
 */
export const collectExtraTurnFlow = (
  state: GameState,
  player: PlayerState,
): { flow: ActionFlow; cardId: string } | null => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  let skipped = Math.max(0, player._extraTurnSkipCount ?? 0) + Math.max(0, player._extraTurnConsumedCount ?? 0)
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.contributeExtraTurn) continue
    try {
      if (effect.countExtraTurns) {
        const rawCount = effect.countExtraTurns(state, player)
        const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0
        if (count === 0) continue
        if (skipped >= count) {
          skipped -= count
          continue
        }
      }
      const flow = effect.contributeExtraTurn(state, player)
      if (!effect.countExtraTurns && flow && skipped > 0) {
        skipped -= 1
        continue
      }
      if (flow) return { flow, cardId }
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} contributeExtraTurn threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return null
}

const countExtraTurnOpportunities = (
  state: GameState,
  player: PlayerState,
  effect: CardEffect,
  skipped: number,
): number => {
  if (effect.countExtraTurns) {
    const rawCount = effect.countExtraTurns(state, player)
    const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0
    if (count === 0 || skipped >= count) return count
    return effect.contributeExtraTurn?.(state, player) ? count : 0
  }
  return effect.contributeExtraTurn?.(state, player) ? 1 : 0
}

export const countPendingExtraTurns = (state: GameState, player: PlayerState): number => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  let skipped = Math.max(0, player._extraTurnSkipCount ?? 0) + Math.max(0, player._extraTurnConsumedCount ?? 0)
  let pending = 0
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.contributeExtraTurn) continue
    try {
      const count = countExtraTurnOpportunities(state, player, effect, skipped)
      if (count === 0) continue
      if (skipped >= count) {
        skipped -= count
        continue
      }
      pending += count - skipped
      skipped = 0
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} contributeExtraTurn threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return pending
}

export const consumePendingExtraTurns = (state: GameState, player: PlayerState): number => {
  const pending = countPendingExtraTurns(state, player)
  if (pending <= 0) return 0
  player._extraTurnConsumedCount = Math.max(0, player._extraTurnConsumedCount ?? 0) + pending
  return pending
}

/**
 * Whether any of `player`'s played cards wants to contribute a turn-rotation
 * extra action this turn. Used by `round.ts` gating to let the rotation stop on
 * an out-of-workers player (and to avoid ending the round prematurely) when an
 * extra turn is still pending.
 */
export const hasPendingExtraTurn = (state: GameState, player: PlayerState): boolean =>
  collectExtraTurnFlow(state, player) !== null

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

export type SpecialStableCandidate = {
  position: FarmTilePosition
  sourceCardId: string
}

export type BuiltSpecialStable = {
  position: FarmTilePosition
  sourceCardId: string
}

/**
 * Collect currently-standing special stables (e.g. B85 FarmHand's 2×2 field
 * centre) from every card the player owns that implements
 * `getBuiltSpecialStables`. Returns one entry per standing tile tagged with the
 * owning card id. Empty until built, and empty again after D102 / E76 returns
 * the tile — the core path carries no per-card knowledge.
 */
export const collectBuiltSpecialStables = (
  player: PlayerState,
): BuiltSpecialStable[] => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  const built: BuiltSpecialStable[] = []
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.getBuiltSpecialStables) continue
    try {
      for (const position of effect.getBuiltSpecialStables(player)) {
        built.push({ position, sourceCardId: cardId })
      }
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} getBuiltSpecialStables threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return built
}

/**
 * Collect special-stable candidates (e.g. B85 FarmHand's 2×2 field centre)
 * from every card the player owns that implements `getSpecialStablePositions`.
 * Each candidate carries the owning card id so the settlement path can tag the
 * resulting `farm.stableBuilt` item with `kind:'special'` + `sourceCardId`.
 */
export const collectSpecialStablePositions = (
  state: GameState,
  player: PlayerState,
): SpecialStableCandidate[] => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  const candidates: SpecialStableCandidate[] = []
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.getSpecialStablePositions) continue
    try {
      for (const position of effect.getSpecialStablePositions(state, player)) {
        candidates.push({ position, sourceCardId: cardId })
      }
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} getSpecialStablePositions threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return candidates
}

/**
 * Apply a special stable at `position` by delegating to whichever owned card
 * accepts it. Returns the owning card id on success, or null when no card
 * could settle the position.
 */
export const applySpecialStableAt = (
  state: GameState,
  player: PlayerState,
  position: FarmTilePosition,
): { sourceCardId: string } | null => {
  const allCards = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.applySpecialStable) continue
    try {
      if (effect.applySpecialStable(state, player, position)) {
        return { sourceCardId: cardId }
      }
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} applySpecialStable threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return null
}
