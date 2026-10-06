import type { ActionFlow, FarmTilePosition, GameState, InteractionRequest, Pasture, PaymentResourceMap, PlayerState, ProtectedObservation, Resource, ResourceKey } from '../contract/types'
import type { PrivateGameEvent } from '../contract/private-events'
import type { CardRuleContributions, CardStatePresentation } from '../contract/card-state'
import type { AnimalZone, PlayerScoreSummary, ScoreCategoryResult } from '../domain'
import { getCurrentSessionContext } from './session-card-context'
import { getActiveCardRegistry } from './active-registry'
import { positionKey } from '../domain/farm'
import { getPlacementBlockedFarmyardSpaceKeys } from '../domain/farmyard-space-states'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../contract/animals'

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
 * authors can mirror the reference's `foreach($zone['meeples'] as $meeple)` loop.
 */
export type Meeple = {
  type: AnimalKey
}

export type BreedAnimalType = AnimalKey

export type BreedThresholdContext = {
  sourceCard: string
}

export type BreedThresholdHandler = (
  state: GameState,
  player: PlayerState,
  animalType: BreedAnimalType,
  ctx: BreedThresholdContext,
) => number | undefined

export type BreedableAnimalCountHandler = (
  state: GameState,
  player: PlayerState,
  animalType: BreedAnimalType,
  currentCount: number,
  ctx: BreedThresholdContext,
) => number | undefined

export type AnimalScoreAdjustmentHandler = (
  state: GameState,
  player: PlayerState,
  animalType: AnimalKey,
  ctx: { quantity: number; baseScore: number; categoryKey: string },
) => number | undefined

export type AnimalPaymentHandler = (
  state: GameState | undefined,
  player: PlayerState,
  animalType: AnimalKey,
  amount: number,
) => number | undefined

export type AnimalRemovedHandler = (
  state: GameState | undefined,
  player: PlayerState,
  animalType: AnimalKey,
  amount: number,
) => void

export type SharedAnimalZoneHandler = (
  owner: PlayerState,
  animalOwner: PlayerState,
  zones: AnimalZone[],
  state: GameState,
) => void | AnimalZone[]

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
  originalFeeIndex?: number
  returnedCardId?: string
}

export type CardEffectHook = 'onBuy' | 'onBeforeWork' | 'onRoundStart' | 'onHarvest' | 'onRoundEnd' | 'onEndTurn' | 'onReturnHome'
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
  'onBeforeWork',
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

export type HandCardEffectHook = Exclude<FlowCardEffectHook, 'onBuy' | 'onEndTurn' | 'onBeforeEndGame'>

export const isHandCardEffectHook = (hook: string): hook is HandCardEffectHook =>
  hook !== 'onBuy' &&
  hook !== 'onEndTurn' &&
  hook !== 'onBeforeEndGame' &&
  flowCardEffectHooks.includes(hook as FlowCardEffectHook)

/**
 * Function-type fields on CardEffect addressable by the custom-code executor.
 * `cardEffectHooks` below is the actual sandbox allowlist; this wider union also
 * retains official-only fields used by shared invocation types.
 *
 * `handHooks` (meta-field) and engine-internal adjuncts such as
 * `countExtraTurns` are deliberately excluded.
 */
export type CardEffectField = CardEffectHook
  | 'resolveChoice'
  | 'contributeExtraTurn'
  | 'computeBonusScore' | 'computeSharedPostScore' | 'computeCostedBonus'
  | 'computeExtraRoomCapacity'
  | 'computeHarvestBreedOrderPriority'
  | 'onComputeAnimalZones' | 'onComputeSharedAnimalZones' | 'onComputeSowableFields' | 'onSowExtraField'
  | 'computeLockedFarmTiles'
  | 'getInvalidAnimals'
  | 'getSpecialStablePositions' | 'applySpecialStable' | 'getBuiltSpecialStables'
  | 'getRuleContributions'
  | 'returnSpecialStable'
  | 'getStatePresentation'

export { cardEffectHooks } from '../projections/card-effect-hooks'
type FlowEffectHandler = (
  state: GameState,
  player: PlayerState,
  ctx?: FlowEffectContext,
) => ActionFlow | void
export type FlowEffectContext = {
  triggerActionId?: string
  reportProtectedObservation?: (observation: ProtectedObservation) => void
}
type FlowEffectHandlerWithContext = (
  state: GameState,
  player: PlayerState,
  ctx?: FlowEffectContext,
) => ActionFlow | void
type FlowEffectHandlerWithPayment = (
  state: GameState,
  player: PlayerState,
  paymentInfo?: PaymentInfo,
  ctx?: FlowEffectContext,
) => ActionFlow | void
export type BeforeEndGameScope = 'owner' | 'allPlayers'

export type ResolveChoiceHandler = (
  state: GameState,
  player: PlayerState,
  choice: string,
  ctx: {
    sourceCard: string
    actionContext?: Record<string, unknown>
    emitPrivateEvent?: (event: PrivateGameEvent) => void
    reportProtectedObservation?: (observation: ProtectedObservation) => void
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

export type ResourceCommitment = { playerId: string; resources: Partial<Resource> }

export type CardEffect = {
  id: string
  projectInteractionRequest?: (state: GameState, player: PlayerState, request: InteractionRequest, actionId: string | undefined) => InteractionRequest
  computeResourceCommitments?: (state: GameState, owner: PlayerState) => readonly ResourceCommitment[]
  preHarvestGoodsWanted?: ResourceKey[]
  preHarvestGoodsWantedBeforeReap?: ResourceKey[]
  maySkipHarvestFieldPhase?: boolean
  onBuy?: FlowEffectHandlerWithPayment
  /** Fires when a pending `choice` whose sourceCard is this card is resolved.
   *  If the handler returns an ActionFlow, it is inserted as the next engine node. */
  resolveChoice?: ResolveChoiceHandler
  /**
   * Turn-rotation extra-action provider. Returns an `ActionFlow` when this
   * card can still grant `player` an extra placement this round, or `void`
   * when it cannot. Round gating collects all providers; one provider is
   * expanded directly, multiple providers are offered as one-shot
   * trigger-select activations.
   */
  contributeExtraTurn?: (state: GameState, player: PlayerState) => ActionFlow | void
  countExtraTurns?: (state: GameState, player: PlayerState) => number
  extraTurnBeforeWorkers?: boolean
  onBeforeWork?: FlowEffectHandler
  onRoundStart?: FlowEffectHandler
  onHarvest?: FlowEffectHandler
  onRoundEnd?: FlowEffectHandler
  onEndTurn?: FlowEffectHandlerWithContext
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
   * player. Mirrors the reference `Globals::setSkipNext` consumed in `stLabor`.
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
  /** Deterministic read-only facts, aggregated by generic rule queries. */
  getRuleContributions?: (player: Readonly<PlayerState>) => CardRuleContributions | void
  getStatePresentation?: (player: Readonly<PlayerState>) => CardStatePresentation | void
  computeHarvestBreedOrderPriority?: (state: GameState, player: PlayerState) => number | void
  computePastureCapacityModifiers?: (
    player: PlayerState,
    state: GameState,
  ) => PastureCapacityModifier[]
  computeBreedThreshold?: BreedThresholdHandler
  computeBreedableAnimalCount?: BreedableAnimalCountHandler
  computeAnimalScoreAdjustment?: AnimalScoreAdjustmentHandler
  consumeAnimalPayment?: AnimalPaymentHandler
  onAnimalRemoved?: AnimalRemovedHandler
  onComputeAnimalZones?: (
    player: PlayerState,
    zones: AnimalZone[],
    state: GameState,
  ) => void | AnimalZone[]
  onComputeSharedAnimalZones?: SharedAnimalZoneHandler
  /**
   * Per-card zone validation. Mirrors the reference `getInvalidAnimals($zone, $raise)`.
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
  /** Return this source's standing tile, preserving any one-use marker. */
  returnSpecialStable?: (player: PlayerState, position: FarmTilePosition) => boolean
  /**
   * The reference `enforceReorganizeOnLastHarvest`: cards like B104 SheepWalker, B35
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
  handHooks?: HandCardEffectHook[]
  beforeEndGameScope?: BeforeEndGameScope
  beforeEndGameMandatory?: boolean
}

export const getCardEffect = (id: string): CardEffect | null => {
  const sessionCtx = getCurrentSessionContext()
  const custom = sessionCtx?.customEffects.get(id)
  if (custom) return custom
  const active = getActiveCardRegistry()
  return active?.getEffect(id) ?? null
}

export const resourceCommitmentsSatisfied = (state: GameState): boolean => {
  const totals = new Map<string, Partial<Resource>>()
  for (const owner of state.players) {
    for (const cardId of [...owner.improvements, ...owner.minorPlayed, ...owner.occupationPlayed]) {
      for (const commitment of getCardEffect(cardId)?.computeResourceCommitments?.(state, owner) ?? []) {
        const total = totals.get(commitment.playerId) ?? {}
        for (const [key, amount] of Object.entries(commitment.resources)) {
          const resource = key as keyof Resource
          total[resource] = (total[resource] ?? 0) + amount
        }
        totals.set(commitment.playerId, total)
      }
    }
  }
  return [...totals].every(([playerId, resources]) => {
    const player = state.players.find((entry) => entry.id === playerId)
    return player !== undefined && Object.entries(resources).every(([key, amount]) =>
      (player.resources[key as keyof Resource] ?? 0) >= amount)
  })
}

const isCustomCard = (id: string) => id.startsWith('CUSTOM_')

export const runCardEffectHook = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  hook: FlowCardEffectHook,
  paymentInfo?: PaymentInfo,
  ctx?: FlowEffectContext,
): ActionFlow | null => {
  const effect = getCardEffect(cardId)
  const handler = effect?.[hook]
  if (!handler) return null
  try {
    if (hook === 'onBuy') {
      return (handler as FlowEffectHandlerWithPayment)(state, player, paymentInfo, ctx) ?? null
    }
    if (hook === 'onEndTurn') {
      return (handler as FlowEffectHandlerWithContext)(state, player, ctx) ?? null
    }
    return (handler as FlowEffectHandler)(state, player, ctx) ?? null
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
 * A153 PigOwner). Mirrors the reference's `enforceReorganizeOnLastHarvest` aggregation
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
    ...(player.improvements ?? []),
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
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

export const getBreedableAnimalCount = (
  state: GameState,
  player: PlayerState,
  animalType: BreedAnimalType,
  currentCount: number,
  ctx: BreedThresholdContext,
): number => {
  const allCards = [
    ...(player.improvements ?? []),
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
  ]
  let count = Math.max(0, Math.floor(currentCount))
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    const handler = effect?.computeBreedableAnimalCount
    if (!handler) continue
    try {
      const next = handler(state, player, animalType, count, ctx)
      if (typeof next !== 'number' || Number.isNaN(next)) continue
      count = Math.max(0, Math.floor(next))
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} computeBreedableAnimalCount threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return count
}

export const getAnimalScoreAdjustment = (
  state: GameState,
  player: PlayerState,
  animalType: AnimalKey,
  ctx: { quantity: number; baseScore: number; categoryKey: string },
): number => {
  const allCards = [
    ...(player.improvements ?? []),
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
  ]
  let adjustment = 0
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    const handler = effect?.computeAnimalScoreAdjustment
    if (!handler) continue
    try {
      const next = handler(state, player, animalType, ctx)
      if (typeof next !== 'number' || Number.isNaN(next)) continue
      adjustment += next
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} computeAnimalScoreAdjustment threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return adjustment
}

export const getHarvestBreedOrderPriority = (
  state: GameState,
  player: PlayerState,
): number => {
  const allCards = [
    ...(player.improvements ?? []),
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
  ]
  let priority = 0
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    const handler = effect?.computeHarvestBreedOrderPriority
    if (!handler) continue
    try {
      const next = handler(state, player)
      if (typeof next !== 'number' || Number.isNaN(next)) continue
      priority = Math.max(priority, Math.floor(next))
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} computeHarvestBreedOrderPriority threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return priority
}

export const consumeAnimalPaymentFromCardEffects = (
  state: GameState | undefined,
  player: PlayerState,
  animalType: AnimalKey,
  amount: number,
): number => {
  const allCards = [
    ...(player.improvements ?? []),
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
  ]
  let remaining = Math.max(0, Math.floor(amount))
  for (const cardId of allCards) {
    if (remaining <= 0) break
    const effect = getCardEffect(cardId)
    const handler = effect?.consumeAnimalPayment
    if (!handler) continue
    try {
      const consumed = handler(state, player, animalType, remaining)
      if (typeof consumed !== 'number' || Number.isNaN(consumed)) continue
      remaining -= Math.max(0, Math.min(remaining, Math.floor(consumed)))
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} consumeAnimalPayment threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return Math.max(0, Math.floor(amount)) - remaining
}

export const notifyAnimalsRemovedFromCardEffects = (
  state: GameState | undefined,
  player: PlayerState,
  counts: Partial<Record<AnimalKey, number>>,
): void => {
  const allCards = [
    ...(player.improvements ?? []),
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
  ]
  for (const animalType of ALL_ANIMAL_KEYS) {
    const amount = Math.max(0, Math.floor(counts[animalType] ?? 0))
    if (amount <= 0) continue
    for (const cardId of allCards) {
      const effect = getCardEffect(cardId)
      const handler = effect?.onAnimalRemoved
      if (!handler) continue
      try {
        handler(state, player, animalType, amount)
      } catch (err) {
        if (isCustomCard(cardId)) {
          console.warn(`[card-effects] custom card ${cardId} onAnimalRemoved threw, skipping:`, err)
          continue
        }
        throw err
      }
    }
  }
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

export type ExtraTurnContribution = {
  cardId: string
  ownerPlayerId: string
  count: number
  flow: ActionFlow
}

const extraTurnCardIds = (player: PlayerState): string[] => [
  ...player.improvements,
  ...player.minorPlayed,
  ...player.occupationPlayed,
]

const extraTurnCountForCard = (
  state: GameState,
  player: PlayerState,
  effect: CardEffect,
): number => {
  if (effect.countExtraTurns) {
    const rawCount = effect.countExtraTurns(state, player)
    return Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0
  }
  return effect.contributeExtraTurn?.(state, player) ? 1 : 0
}

const extraTurnCounter = (
  map: Record<string, number> | undefined,
  cardId: string,
): number => Math.max(0, Math.floor(map?.[cardId] ?? 0))

export const collectExtraTurnContributions = (
  state: GameState,
  player: PlayerState,
): ExtraTurnContribution[] => {
  const contributions: ExtraTurnContribution[] = []
  for (const cardId of extraTurnCardIds(player)) {
    const effect = getCardEffect(cardId)
    if (!effect?.contributeExtraTurn) continue
    try {
      const count = extraTurnCountForCard(state, player, effect)
      const skipped =
        extraTurnCounter(player._extraTurnSkipCountsByCard, cardId) +
        extraTurnCounter(player._extraTurnConsumedCountsByCard, cardId)
      const remaining = Math.max(0, count - skipped)
      if (remaining <= 0) continue
      const flow = effect.contributeExtraTurn(state, player)
      if (flow) {
        contributions.push({ cardId, ownerPlayerId: player.id, count: remaining, flow })
      }
    } catch (err) {
      if (isCustomCard(cardId)) {
        console.warn(`[card-effects] custom card ${cardId} contributeExtraTurn threw, skipping:`, err)
        continue
      }
      throw err
    }
  }
  return contributions
}

const extraTurnActivationFlow = (cardId: string): ActionFlow => ({
  type: 'leaf',
  actionId: 'activate-extra-turn',
  params: { cardId },
  sourceCard: cardId,
})

/**
 * Collect turn-rotation extra-action providers. A single provider is expanded
 * directly; multiple providers become a one-shot trigger-select so the player
 * chooses which card's extra turn to use now.
 */
export const collectExtraTurnFlow = (
  state: GameState,
  player: PlayerState,
  withWorkers = false,
): { flow: ActionFlow; cardId?: string } | null => {
  const contributions = collectExtraTurnContributions(state, player)
    .filter((entry) => !withWorkers || getCardEffect(entry.cardId)?.extraTurnBeforeWorkers === true)
  if (contributions.length === 0) return null
  if (withWorkers) {
    return {
      flow: {
        type: 'xor',
        children: [
          {
            type: 'leaf',
            actionId: 'place-farmer',
            choiceLabelKey: 'actions.place-farmer.name',
          },
          ...contributions.map((entry) => extraTurnActivationFlow(entry.cardId)),
        ],
      },
    }
  }
  if (contributions.length === 1) {
    const contribution = contributions[0]!
    return { flow: contribution.flow, cardId: contribution.cardId }
  }
  return {
    flow: {
      type: 'parallel',
      mode: 'trigger-select',
      triggerSelectOnce: true,
      children: contributions.map((contribution) => extraTurnActivationFlow(contribution.cardId)),
    },
  }
}

export const countPendingExtraTurns = (state: GameState, player: PlayerState): number => {
  return collectExtraTurnContributions(state, player)
    .reduce((sum, contribution) => sum + contribution.count, 0)
}

export const consumePendingExtraTurns = (state: GameState, player: PlayerState): number => {
  const contributions = collectExtraTurnContributions(state, player)
  const consumed = contributions.reduce((sum, contribution) => sum + contribution.count, 0)
  if (consumed <= 0) return 0
  const next = { ...(player._extraTurnConsumedCountsByCard ?? {}) }
  for (const contribution of contributions) {
    next[contribution.cardId] = extraTurnCounter(next, contribution.cardId) + contribution.count
  }
  player._extraTurnConsumedCountsByCard = next
  return consumed
}

export const skipPendingExtraTurn = (state: GameState, player: PlayerState): boolean => {
  const contribution = collectExtraTurnContributions(state, player)[0]
  if (!contribution) return false
  player._extraTurnSkipCountsByCard = {
    ...(player._extraTurnSkipCountsByCard ?? {}),
    [contribution.cardId]:
      extraTurnCounter(player._extraTurnSkipCountsByCard, contribution.cardId) + 1,
  }
  return true
}

/**
 * Whether any of `player`'s played cards wants to contribute a turn-rotation
 * extra action this turn. Used by `round.ts` gating to let the rotation stop on
 * an out-of-workers player (and to avoid ending the round prematurely) when an
 * extra turn is still pending.
 */
export const hasPendingExtraTurn = (state: GameState, player: PlayerState): boolean =>
  collectExtraTurnContributions(state, player).length > 0

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
  const lockedKeys = getPlacementBlockedFarmyardSpaceKeys(player)
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
  const allCards = new Set([
    ...(player.improvements ?? []),
    ...(player.minorPlayed ?? []),
    ...(player.occupationPlayed ?? []),
  ])
  const built: BuiltSpecialStable[] = []
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.getBuiltSpecialStables) continue
    try {
      const seen = new Set<string>()
      for (const position of effect.getBuiltSpecialStables(JSON.parse(JSON.stringify(player)) as PlayerState)) {
        if (!Number.isInteger(position?.row) || !Number.isInteger(position?.col)) continue
        const key = positionKey(position)
        if (seen.has(key)) continue
        seen.add(key)
        built.push({ position: { row: position.row, col: position.col }, sourceCardId: cardId })
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
