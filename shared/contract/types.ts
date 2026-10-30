import type { MoorCompletionFrame } from '../moor/completion-types'
import type { AnytimeActivation } from './anytime-activation'
import type { PersonUseReceipt } from './person-use'
import type { ActionHookRegistry } from '../actions/hooks'
import type { RuleOperationPreview } from './rule-operation-previews'
import type { PromptKey } from './prompt-keys'
import type { EventSink, GameEvent, PublicEventArchivePacket } from './events'
import type { PrivateGameEvent } from './private-events'
import type { FatherParentCardId, MotherParentCardId } from '../parents/types'
import type { ThroughTheSeasonsState } from '../seasons/types'
import type { FarmersOfTheMoorState, FarmTerrainTile, MoorSoloChoice } from '../moor/types'
import type { AnimalKey } from './animals'
import type { SeasonalAdjustment } from './seasonal-adjustments'
import type { SoloHandMode } from './game-creation'
import type { SoloHandSelectionState, SoloHandSelectionGroup } from './solo-hand-selection'

export type Resource = {
  wood: number
  clay: number
  reed: number
  stone: number
  food: number
  grain: number
  vegetable: number
  sheep: number
  boar: number
  cattle: number
  horse?: number
  fuel?: number
  begging: number
}

export type SupplyTokenKey = 'fence' | 'stable'
export type SupplyTokenCounts = Partial<Record<SupplyTokenKey, number>>
export type PaymentResource = Resource & Record<SupplyTokenKey, number>
export type CardProvidedPaymentResourceKey = `${string}:${string}`
export type PaymentResourceKey = keyof PaymentResource | CardProvidedPaymentResourceKey
export type PaymentResourceMap = Partial<Record<PaymentResourceKey, number>>
export type FutureMeepleResourceMap = Partial<Resource> & {
  field?: number
  stable?: number
  forest?: number
  moor?: number
}

// Pseudo-resource map — used ONLY by CardResourceStats.gained to record
// "Plows: N / Built: N rooms / Occupations played: N" lines via
// the same Partial<Resource>-shaped storage slot. These keys are NEVER
// stored in player.resources or space.resources. See
// shared/contract/resource-keys.ts for the runtime list / discriminator.
export type PseudoResourceMap = {
  occupation?: number
  field?: number
  roomWood?: number
  roomClay?: number
  roomStone?: number
  stable?: number
}

// Storage shape for `CardResourceStats.gained`: real-resource counts plus
// optional pseudo-resource counters. All Partial because individual cards
// only touch the keys they care about.
export type CardStatGained = Partial<Resource> & PseudoResourceMap

export type ResourceKey = keyof Resource

export type ResourceReserve = {
  resources: readonly ResourceKey[]
  minimum: number
}

export type OrdinaryCardType = 'occupation' | 'minor'

export type OrdinaryCardDecks = {
  occupation: string[]
  minor: string[]
}

export type OrdinaryCardDrawChoice = {
  id: string
  playerId: string
  cardType: OrdinaryCardType
  candidates: string[]
  sourceCard?: string
  sourceActionId?: string
}

export type CardProvidedPaymentResourceCover = {
  resource: ResourceKey
  costAmount: number
  paymentAmount: number
}

export type CardProvidedPaymentResourceConsume =
  | { type: 'actionSpace'; spaceId: string; resource: ResourceKey }

export type CardProvidedPaymentResourceProvider = {
  key: CardProvidedPaymentResourceKey
  sourceCard: string
  available: number
  covers: CardProvidedPaymentResourceCover[]
  consume: CardProvidedPaymentResourceConsume
}

export type PaymentResourceCoverUsage = {
  paymentResource: CardProvidedPaymentResourceKey
  costResource: ResourceKey
  paymentAmount: number
  costAmount: number
}

export type ExactCost = Partial<Resource> & {
  max?: number
}

export type TradeSideEffect =
  | { type: 'drainSpace'; spaceId: string; resource: ResourceKey }
  | { type: 'bonusVp'; amount: number }
  | { type: 'pushExtraDataValue'; sourceCard: string; key: string; value: string }

export type Trade = {
  from: Partial<Resource>
  to: Partial<Resource>
  fromFarmyard?: boolean
  blockedAnytimeInteractionKinds?: InteractionRequest['kind'][]
  max?: number
  scope?: 'action' | 'unit'   // default 'action' (back-compat)
  groupId?: string
  groupMin?: number
  groupMax?: number
  replaceUpTo?: boolean
  minCost?: Partial<Resource>
  maxCost?: Partial<Resource>
  source?: string
  sourceId?: string
  sideEffect?: TradeSideEffect
}

export type BonusChoice = {
  discount: Partial<Resource>
  capDiscountAtCost?: boolean
  trackChoiceIndex?: boolean
  choiceAffectsState?: boolean
  sources?: string[]
  /**
   * Player-state conditions evaluated by `computeAllBuyableCombinations`
   * (`shared/actions/helpers/payment.ts`). Supported keys:
   *   - `minNumRooms` — player.rooms >= N
   *   - `houseTypeWood` / `houseTypeClay` / `houseTypeStone` — player.houseType match
   * For roomCount-dependent gating in the construct path, prefer a
   * `BonusModifier` — `room-payment.ts` evaluates per build call.
   */
  conditions?: Record<string, number>
  minCost?: Partial<Resource>
  maxCost?: Partial<Resource>
}

export type Bonus = {
  discount?: Partial<Resource>
  choices?: BonusChoice[]
  capDiscountAtCost?: boolean
  trackChoiceIndex?: boolean
  choiceAffectsState?: boolean
  optional?: boolean
  sources?: string[]
  /**
   * Player-state conditions evaluated by `computeAllBuyableCombinations`
   * (`shared/actions/helpers/payment.ts`). Supported keys:
   *   - `minNumRooms` — player.rooms >= N
   *   - `houseTypeWood` / `houseTypeClay` / `houseTypeStone` — player.houseType match
   * For roomCount-dependent gating in the construct path, prefer a
   * `BonusModifier` — `room-payment.ts` evaluates per build call.
   */
  conditions?: Record<string, number>
  minCost?: Partial<Resource>
  maxCost?: Partial<Resource>
}

export type CostModifierType = 'construct' | 'renovation' | 'occupation' | 'fencing' | 'stables' | 'plow' | 'major-improvement' | 'minor-improvement'

export type TradeModifier = {
  type: 'trade'
  cardId: string
  appliesTo: CostModifierType[]
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  scope?: 'action' | 'unit'   // default 'action'
  groupId?: string
  groupMin?: number
  groupMax?: number
  replaceUpTo?: boolean
  minCost?: Partial<Resource>
  maxCost?: Partial<Resource>
  /**
   * Player-state conditions evaluated when the modifier is applied. Same
   * supported keys as `Bonus.conditions` (`minNumRooms`, `houseTypeWood` /
   * `houseTypeClay` / `houseTypeStone`). For the `construct` cost type,
   * `room-payment.ts` evaluates these per build call (mirrors the existing
   * BonusModifier path). Other cost types apply the same checks via
   * `getModifiersForCostType` / `evaluateConditions`.
   */
  conditions?: Record<string, number>
}

export type BonusModifier = {
  type: 'bonus'
  cardId: string
  appliesTo: CostModifierType[]
  discount?: Partial<Resource>
  choices?: BonusChoice[]
  capDiscountAtCost?: boolean
  trackChoiceIndex?: boolean
  choiceAffectsState?: boolean
  optional?: boolean
  conditions?: Record<string, number>
  minCost?: Partial<Resource>
  maxCost?: Partial<Resource>
}

export type CostResourceRemovalModifier = {
  type: 'remove-resource'
  cardId: string
  appliesTo: CostModifierType[]
  resources: ResourceKey[]
}

export type AppliedCostResourceRemoval = {
  resource: ResourceKey
  sourceCard: string
  savedByFee: number[]
}

export type CostModifier = TradeModifier | BonusModifier | CostResourceRemovalModifier

export type ComplexCost = {
  fee?: PaymentResourceMap
  fees?: PaymentResourceMap[]
  /**
   * Payment-path identity per fees index (Cost Candidate originalFeeIndex).
   * Solutions with different identities are never dominance-pruned against
   * each other — the chosen path can drive later effects (B65). Omitted ⇒
   * all rows share one identity.
   */
  feeIdentities?: number[]
  unitFee?: PaymentResourceMap      // per-unit cost; total fee += nb × unitFee
  nb?: number                       // unit count; construct=rooms, renovation=player.rooms
  trades?: Trade[]
  paymentResourceProviders?: CardProvidedPaymentResourceProvider[]
  paymentBudget?: PaymentResourceMap
  minimumResourcesPaid?: PaymentResourceMap
  resourceReserve?: ResourceReserve
  cards?: { type: string; list: string[]; cost?: PaymentResourceMap; required?: boolean }
  bonuses?: Bonus[]
  costResourceRemovals?: AppliedCostResourceRemoval[]
}

export type CostAttribution = {
  saved?: PaymentResourceMap
  paid?: PaymentResourceMap
}

export type TradeUsage = {
  trade: Trade
  times: number
  costAttribution?: CostAttribution
}

export type CostAttributionBySource = Record<string, CostAttribution>

export type CardCostCandidateMetadata = {
  originalFeeIndex: number
  sources: string[]
  costAttribution?: CostAttributionBySource
  seasonalAdjustments?: SeasonalAdjustment[]
}

export type CardCostCandidate = CardCostCandidateMetadata & {
  resources: PaymentResourceMap
}

export type ActionCostAttribution = {
  sourceCard: string
  costs: Partial<Resource>
}

export type PaymentSolution = {
  resourcesPaid: PaymentResourceMap
  tradesUsed: TradeUsage[]
  cardUsed?: string
  bonusUsed?: string
  bonusChoiceIndex?: Record<string, number>
  bonusChoiceAffectsState?: Record<string, boolean>
  bonusReductions?: Record<string, PaymentResourceMap>
  feeIndex?: number
  /** Payment-path identity from ComplexCost.feeIdentities (dominance-pruning scope). */
  feeIdentity?: number
  paymentResourceCovers?: PaymentResourceCoverUsage[]
}

export type PaymentSource = 'reserve' | 'field' | 'card'

export type CropStack = {
  kind: 'grain' | 'vegetable' | 'wood' | 'stone'
  remaining: number
}

export type Field = {
  stacks: CropStack[]
  row: number
  col: number
}

export type SupplyWorkerSource = {
  kind: 'supply'
  disposition: 'return-to-supply' | 'remove-from-game'
  workerId?: string
}

export type Worker = {
  id: string
  isActive: boolean
  isNewborn: boolean
  removedFromSupply?: boolean
  supplyUse?: {
    sourceCard?: string
    disposition: SupplyWorkerSource['disposition']
    status: 'reserved' | 'pending' | 'temporary'
    returnRound?: number
  }
}

export type WorkerRef = {
  playerId: string
  workerId: string
  synthetic?: {
    kind: 'linked-occupancy'
    sourceCard: string
    linkedWorkerId: string
  }
}

export type BlockedActionSpaceRef = {
  playerId: string
  workerId: string
  sourceSpaceId: string
}

export type FenceSegmentType = 'fence' | 'palisade'
export type FenceSegmentSource =
  | { kind: 'own'; ownerPlayerId: string }
  | { kind: 'borrowed'; ownerPlayerId: string }
export type FenceSegment = { edge: string; type: FenceSegmentType; source?: FenceSegmentSource }
export type FarmyardExtension = {
  id: string
  sourceCardId?: string
  tiles: FarmTilePosition[]
}

/** An occupied loose stable; empty stables have no assignment entry. */
export type StableAnimalAssignment = {
  animalType: AnimalKey
  animalCount: number
}

export type PlayerState = {
  id: string
  name: string
  /** True only for an engine-generated seat name; chosen account names stay literal. */
  nameIsDefault?: boolean
  color: 'red' | 'yellow' | 'blue' | 'black' | 'green' | 'purple'
  resources: Resource
  farmyardExtensions?: FarmyardExtension[]
  farmTerrain?: FarmTerrainTile[]
  farmyardSpaceStates?: FarmyardSpaceState[]
  workers: Worker[]
  sickWorkerIds?: string[]
  rooms: number
  houseType: 'wood' | 'clay' | 'stone'
  fields: Field[]
  roomTiles: FarmTilePosition[]
  stableTiles: FarmTilePosition[]
  /** Ordinary stable token identities, keyed by their current farm position. */
  stablePieceIds?: Record<string, number>
  /** Construction facts retained only while this player's Turn scope is open. */
  turnConstruction?: {
    stablePieces: string[]
    roomType?: PlayerState['houseType']
    fenceBuilt: boolean
  }
  improvements: string[]
  minorHand: string[]
  minorPlayed: string[]
  occupationHand: string[]
  occupationPlayed: string[]
  extraOccupationsFromCards: string[]
  playedCards: string[]
  houseAnimals: Record<string, AnimalKey>
  stableAnimals: Record<string, StableAnimalAssignment>
  pastures: Pasture[]
  fenceSegments: FenceSegment[]
  majorEffects: MajorEffectState
  startPlayer: boolean
  activeModifiers: CostModifier[]
  cardStates: CardStates
  stats: PlayerStats
  lastDraftSubmission?: import('../draft/types').DraftPickPayload
  parentCards: PlayerParentCards
  supplyTokensConsumed?: SupplyTokenCounts
  /**
   * Session-transient scratchpad: card ids of `BonusModifier` entries whose
   * `sources` fired during the currently-executing action. Initialised by
   * `GameCore` at action start and cleared at action end; appended by
   * `executePaymentSolution` when a bonus path is taken. Used only for
   * attributing the `log.actionDetail` entry to the triggering card.
   */
  _activeActionBonusSources?: string[]
  /**
   * Session-transient count: mandatory skip-turn effects (e.g. D134
   * OysterEater) consume this many turn-rotation extra-action opportunities
   * before the remaining contributed extra turns are offered.
   */
  _extraTurnSkipCountsByCard?: Record<string, number>
  _extraTurnConsumedCountsByCard?: Record<string, number>
}

export type FarmTilePosition = {
  row: number
  col: number
}

export type FarmyardSpaceStateKind =
  | 'blocked-farmyard-space'
  | 'farmyard-goods-token'
  | 'field-goods-token'
  | 'non-field-crop-space'

export type FarmyardSpaceState = {
  spaceKey: string
  sourceCardId: string
  kind: FarmyardSpaceStateKind
  resources?: Partial<Resource>
  crop?: CropStack
  bonusVp?: number
  claimPolicy?: 'when-no-longer-unused' | 'when-sowed'
  blocksPlacement?: boolean
}

export type Pasture = {
  id: string
  tiles: FarmTilePosition[]
  animalType: AnimalKey | null
  animalCount: number
}

export type MajorEffectState = {
  wellRounds: number
}

export type CardState = {
  flagged?: boolean
  infobox?: string
  counters?: Record<string, number>
  extraData?: Record<string, unknown>
  /** Explicitly private to the player storing this state, including after passing a card. */
  privateData?: Record<string, unknown>
  stack?: string[]
}

export type CardResourceStats = {
  used: number
  gained: CardStatGained             // includes pseudo-resource keys
  paid: Partial<Resource>
  saved: Partial<Resource>
  receivedPayment: Partial<Resource>
  paidToOthers: Partial<Resource>
}

export type CardStates = Record<string, CardState>

export type DraftHistoryEntry = {
  cardId: string
  draftTurn: number
  playedTurn?: number
}

export type PlayerStats = {
  placedFarmers: number
  firstPlayerCount: number
  totalRoomsBuilt: number
  totalMajorBuilt: number
  totalMinorBuilt: number
  totalOccupationBuilt: number
  harvestedGrain: number
  harvestedVegetable: number
  resourcesFromBoard: Partial<Resource>
  resourcesFromCards: Partial<Resource>
  resourcesConverted: Partial<Resource>
  foodFromConversion: Partial<Resource>
  draftHistory: DraftHistoryEntry[]
  draftDiscarded: string[]
}

export type LogEntry = {
  key: string
  params?: Record<string, unknown>
  /** Association with the event occurrence that produced this presentation row. */
  sourceEvent?: { occurrenceId: string; rowIndex: number }
  playerId?: string
  /** Identity for additional player-name parameters such as fromPlayer/toPlayer. */
  playerRefs?: Record<string, string>
}

export type PlayerParentCards = {
  mother: MotherParentCardId | null
  father: FatherParentCardId | null
}

export type ParentSelectionCandidates = {
  mother: MotherParentCardId[]
  father: FatherParentCardId[]
}

export type ParentSelectionSubmission = {
  mother: MotherParentCardId
  father: FatherParentCardId
}

export type ParentSelectionState = {
  candidates: Record<string, ParentSelectionCandidates>
  submissions: Record<string, ParentSelectionSubmission | null>
}

export type FutureMeepleRoomType = 'wood' | 'clay' | 'stone'

export type FutureMeeple = {
  id: string
  cardId: string
  playerId: string
  round: number
  actionId: string | null
  resources: FutureMeepleResourceMap
  roomType?: FutureMeepleRoomType
  actionContext?: ActionContext
}

export type ScheduledEffectPreview = {
  round: number
  sourceCard: string
  timing?: import('./rule-plans').TimedRulePhase | 'afterBeforeReturnHomeHooks' | 'afterReturnHomeHooks'
  description: ChoiceDescriptionPreview
  count: number
}

export type FutureMeepleSourceSummary = {
  key: 'log.salterFutureFood'
  params: {
    cardId: string
    animals: string
    sheep: number
    boar: number
    cattle: number
    futureFood: number
    schedule: string
  }
}

export type FutureMeepleRequest =
  | {
      cardId: string
      playerId: string
      sourceSummary?: FutureMeepleSourceSummary
      startRound: number
      count: number
      resources: FutureMeepleResourceMap
      actionContext?: ActionContext
    }
  | {
      cardId: string
      playerId: string
      sourceSummary?: FutureMeepleSourceSummary
      entries: {
        round: number
        resources?: FutureMeepleResourceMap
        roomType?: FutureMeepleRoomType
        actionContext?: ActionContext
      }[]
    }

export type HarvestedCropSummaryEntry = {
  row: number
  col: number
  crop: CropStack['kind']
  amount: number
  sources: string[]
}

export type HarvestCountApplication = {
  row: number
  col: number
  crop: CropStack['kind']
  count: number
  sources: string[]
  tags: string[]
  scope: 'top-stack' | 'field'
}

export type HarvestReapSummary = {
  resources: Partial<Resource>
  grainFields: number
  vegetableFields: number
  harvestedCrops?: HarvestedCropSummaryEntry[]
  harvestCountApplications?: HarvestCountApplication[]
  /**
   * Positions of every logical field that produced a crop in this reap pass.
   * Ordinary fields use farm coordinates; card fields use their canonical
   * virtual coordinate.
   */
  harvestedPositions?: { row: number; col: number }[]
}

export type HarvestBreedSummary = {
  resources: Partial<Resource>
  animalTypes: number
  animalCount: number
}

export type RoundPhase = 'preparation' | 'work' | 'returning-home' | 'harvest' | 'field' | 'feeding' | 'breeding'

export type MajorSupplyStack = {
  stackId?: string
  familyId: string
  visibleId: string | null
  cardIds: string[]
}

export type SnakeOpeningState = {
  /** True once the round-1 work rotation has wrapped and now walks the Round Work Order backwards. */
  reversed: boolean
}

/**
 * Either an Explicit Seed (a number given by a test, a dev room or a debug
 * endpoint) or a wide seed (a string carrying at least 128 random bits). Only
 * wide seeds protect hidden information; see ADR-0020.
 */
export type GameSeed = number | string

export type GameState = {
  round: number
  /** Opening hands, multiplayer draft, parent selection, or ordinary play. */
  phase: 'draft' | 'solo-hand-selection' | 'parent-selection' | 'playing'
  /** Round sub-phase (preparation/work/returning-home/harvest/field/feeding/breeding). */
  roundPhase: RoundPhase
  /** Draft state when `phase === 'draft'`, otherwise null. */
  draft: import('../draft/types').DraftState | null
  draftMode?: 'simultaneous'
  draftPoolSize?: number
  soloHandMode?: SoloHandMode
  soloHandSelection?: SoloHandSelectionState | null
  parentSelection: ParentSelectionState | null
  currentPlayerIndex: number
  roundFirstPlayerId?: string
  players: PlayerState[]
  actionSpaces: ActionSpace[]
  log: LogEntry[]
  events: GameEvent[]
  nextEventSeq: number
  publicEventArchive: PublicEventArchivePacket[]
  nextPublicEventArchivePacketSeq: number
  roundActionOrder: (string | null)[]
  gameSeed: GameSeed
  /** Monotonic counter incremented every time a card consumes randomness. */
  rngTick?: number
  /** One-shot flag: cards set this before emitting a pending-choice that must not be undone across.
   * GameSession.pushHistory reads, honors, and clears this flag. */
  pendingUndoBoundary?: boolean
  availableMajorImprovements: string[]
  majorImprovementSupply?: MajorSupplyStack[]
  futureMeeples: FutureMeeple[]
  pendingFutureMeeples: FutureMeepleRequest[]
  gameOver: boolean
  /** When true, community-deck cards are included in the deal pool. */
  enableCommunityDeck: boolean
  enableParentCards: boolean
  enableThroughTheSeasons: boolean
  throughTheSeasons: ThroughTheSeasonsState | null
  enableFarmersOfTheMoor?: boolean
  enableMoorBalanceRules?: boolean
  farmersOfTheMoor?: FarmersOfTheMoorState | null
  /** Snake Opening variant: every player starts with 3 food and the round-1 second placement runs in reverse Round Work Order. */
  enableSnakeOpening: boolean
  snakeOpening: SnakeOpeningState | null
  ordinaryCardDecks: OrdinaryCardDecks
  ordinaryCardDrawChoices: Record<string, OrdinaryCardDrawChoice>
  nextOrdinaryCardDrawChoiceSeq: number
  workPhaseObtainedResources: Record<string, Partial<Resource>>
  harvestReapSummary?: Record<string, HarvestReapSummary>
  harvestBreedSummary?: Record<string, HarvestBreedSummary>
  harvestBreedPlacement?: Record<string, {
    minimums: Partial<Record<AnimalKey, number>>
    animalCounts: Partial<Record<AnimalKey, number>>
  }>
  /**
   * Number of feeding phases that have completed (incremented once at the
   * start of each breeding phase, after all players have fed).
   * Consumed by A148_Woolgrower / B086_TruffleSearcher animal capacity.
   * Mirrors the reference `Globals::getCompletedFeedingPhases`.
   */
  completedFeedingPhases: number
}

export type CanBeExecutedByPlayerContext = {
  turnScopeProjection?: TurnScopeProjection
  /** Session-owned runtime dependency; never part of action metadata or snapshots. */
  actionHooks: ActionHookRegistry | undefined
  params?: Record<string, unknown>
  space?: ActionSpace
  /**
   * The card id that originated this action invocation, if any. Forwarded so
   * doable checks can route through the same per-card cost/effect modifiers
   * that pay-time uses (e.g. D95 Site Manager treats `actionCardId === 'D095_SiteManager'`
   * as the trigger for its food-for-resource substitution).
   */
  sourceCard?: string
  /**
   * Listener-driven actionContext (e.g. `tradeIds` for E53 BoarSpear's
   * listener-only exchange). Sprint 6b: forwarded so doable checks see the
   * same metadata the engine will pass to `execute()`.
   */
  actionContext?: ActionContext
}

export type CanBeExecutedByPlayer = (
  state: GameState,
  player: PlayerState,
  context?: CanBeExecutedByPlayerContext,
) => boolean

/** Serializable inputs owned by one action invocation. */
export type ActionContext = Record<string, unknown> & {
  /** Renovation bonuses supplied by this invocation, separate from computeCosts results. */
  costBonuses?: Bonus[]
  submittedExchangeBatch?: ExchangeBatchEntry[]
  harvestFeed?: true
}

export type ExchangeBatchEntry = {
  trade: Trade
  count: number
  harvestRound?: number
}

export type ActionAvailabilityContext = {
  /** Session-owned runtime dependency; never part of action metadata or snapshots. */
  actionHooks: ActionHookRegistry | undefined
  state: GameState
  player: PlayerState
  space?: ActionSpace
  params?: Record<string, unknown>
  sourceCard?: string
  actionContext?: ActionContext
}

export type ProtectedObservation = {
  kind: 'random' | 'hidden-information'
  recipientPlayerIds: string[]
  knownToPlayerIds?: string[]
}

export type ActionSpaceUseContext = { newPlacement: boolean; personUse?: PersonUseReceipt; useId?: string }

/** A pure admission query for the Turn that ordinary placement will open. */
export type TurnScopeProjection = { kind: 'next-turn'; playerId: string }

export type ActionExecutionContext = {
  actionSpaceUse?: ActionSpaceUseContext
  turnScopeProjection?: TurnScopeProjection
  /** Session-owned runtime dependency; never part of action metadata or snapshots. */
  actionHooks: ActionHookRegistry | undefined
  completedTransactionEvents?: readonly GameEvent[]
  previewMode?: 'base'
  state: GameState
  player: PlayerState
  space: ActionSpace
  costs?: Partial<Resource>
  costTrades?: Trade[]
  costBonuses?: Bonus[]
  paymentResourceProviders?: CardProvidedPaymentResourceProvider[]
  costAttribution?: ActionCostAttribution[]
  params?: Record<string, unknown>
  sourceCard?: string
  actionContext?: ActionContext
  emitPrivateEvent?: (event: PrivateGameEvent) => void
  reportProtectedObservation?: (observation: ProtectedObservation) => void
}

/** Explicit pure planning input. Planning cannot emit events or protected observations. */
export type ActionFlowPlanningContext = Pick<ActionExecutionContext,
  'actionHooks' | 'state' | 'player' | 'space' | 'params' | 'sourceCard' | 'actionContext' | 'previewMode'
  | 'costs' | 'costTrades' | 'costBonuses' | 'paymentResourceProviders' | 'costAttribution'>

export type ActionMutationContext = ActionExecutionContext & {
  eventSink: EventSink
}

export type ActionCostPreview = {
  unitCost?: 'room' | 'stable' | 'fence'
  dependsOnHouseType?: boolean
  isStructurallyPossible?: (context: ActionAvailabilityContext) => boolean
  canExecute?: (
    context: ActionAvailabilityContext,
    costOverride?: Partial<Resource>,
  ) => boolean
  getBaseCost: (context: ActionAvailabilityContext) => Partial<Resource>
}

export type ChoiceResourceLocation =
  | { kind: 'player' }
  | { kind: 'card'; cardId: string }
  | { kind: 'actionSpace'; spaceId: string; nameKey: string }

export type RuleAmount = number
  | { kind: 'supply'; resource: keyof Resource }
  | { kind: 'fields'; crop: 'grain' | 'vegetable' }
  | { kind: 'family' }
  | { kind: 'crop-total' }
  | { kind: 'major-improvements' }
  | { kind: 'card-fact'; fact: string }
  | { kind: 'occupied-round-spaces' }
  | { kind: 'scale'; value: RuleAmount; by: number }
  | { kind: 'min'; values: readonly RuleAmount[] }
  | { kind: 'sum'; values: readonly RuleAmount[] }
  | { kind: 'divide'; value: RuleAmount; by: number }

export type RuleCondition =
  | { kind: 'house-type'; houseType: PlayerState['houseType'] }
  | { kind: 'room-for-newborn' }
  | { kind: 'has-fields' }
  | { kind: 'card-flag' }
  | { kind: 'card-fact-positive'; fact: string }
  | { kind: 'inactive-supply-worker' }
  | { kind: 'card-fact-true'; fact: string }
  | { kind: 'purchased-by-round'; round: number; fact: string }
  | { kind: 'extra-room-active'; fact: string }
  | { kind: 'compare'; left: RuleAmount; operator: 'eq' | 'ge' | 'gt'; right: RuleAmount }
  | { kind: 'all'; conditions: readonly RuleCondition[] }

export type ChoiceEffectPreview =
  | { kind: 'collection'; spaceId: string; spaceNameKey: string; resourceTypes: (keyof Resource)[] }
  | { kind: 'resourceBatchExchange'; available: Partial<Resource>; receiveResources: (keyof Resource)[]; minTotal: number; maxTotal: number }
  | { kind: 'workerRecall'; destination: { kind: 'home' } | { kind: 'card'; cardId: string }; workers: { workerId?: string; spaceId: string; spaceNameKey: string }[]; select: boolean; noOp: boolean }
  | { kind: 'exchangeCatalog'; choices: { sourceCard?: string; resourcesPaid: Partial<Resource>; resourcesGained: Partial<Resource>; minTimes: number; maxTimes: number }[] }
  | { kind: 'resourceSetSelection'; choices: (keyof Resource)[]; minDistinct: number; maxDistinct: number; resourcesPerChoice: number; extraGain: Partial<Resource>; quantitiesByUse?: readonly number[] }
  | { kind: 'resourceBundle'; resources: Partial<Resource> }
  | { kind: 'cardRecordSelection'; cardId: string; count: number; choices: Partial<Resource>[] }
  | { kind: 'cardStack'; cardId: string; item: string; amount: number }
  | { kind: 'scoringReserve'; resourcesReserved: Partial<Resource>; bonusVp: number }
  | { kind: 'animalCapacity'; amount: number }
  | { kind: 'virtualRoom'; amount: number; animalCapacity: number }
  | { kind: 'fenceReserve'; amount: number }
  | { kind: 'resourceSale'; stage?: 'buyer-offer'; resourcesSold: Partial<Resource>; supplyReward: Partial<Resource>; buyerPays: Partial<Resource> }
  | { kind: 'resourceQuantitySchedule'; choices: { resource: keyof Resource; available: number; rounds: number[]; resourcesPerUnit: Partial<Resource> }[]; preset?: Partial<Resource> }
  | { kind: 'cardCounter'; cardId: string; counter: string; amount: number }
  | { kind: 'terrainOperation'; operation: 'place' | 'remove' | 'replace-kind' | 'replace-with-field' | 'cover'; from?: 'forest' | 'moor'; to?: 'forest' | 'moor' | 'field'; minSelections: number; maxSelections: number; visibleLayerOnly?: true; requiresUncovered?: true; adjacentFieldRequiredWhenPresent?: true; gainPerSelection?: Partial<Resource>; bonusVpPerSelection?: number }
  | { kind: 'fieldOperation'; operation:
      | { kind: 'replace'; from: 'grain' | 'vegetable'; fromAmount: number; to: 'grain' | 'vegetable'; toAmount: number }
      | { kind: 'remove-top'; amount: number; crop?: 'grain' | 'vegetable'; gain: Partial<Resource> }
      | { kind: 'discard-all' }
      | { kind: 'move'; amount: number };
      minSelections: number; maxSelections: number; location?: 'crop-space' }
  | { kind: 'animalPose'; animal: 'horse'; amount: number; pose: 'lying'; resourcesGained: Partial<Resource> }
  | { kind: 'familyGrowth'; roomRequired: boolean; heldOnCard?: string }
  | { kind: 'harvestFields'; privatePhase: boolean }
  | { kind: 'cardSelection'; types: ('major' | 'minor')[] | ['occupation']; allowedCards?: string[]; resourcesPaid?: Partial<Resource> }
  | { kind: 'roundCardSelection'; ranges: readonly { from: number; to?: number; types: readonly ('major' | 'minor')[] }[] }
  | { kind: 'firstMissingResource'; resources: readonly (keyof Resource)[]; amount: number }
  | { kind: 'bakeRecipes'; recipes: { sourceCard: string; exchange: Extract<ChoiceEffectPreview, { kind: 'resourceExchange' }>; quantityLimit: number }[] }
  | { kind: 'fencePlan'; segments: { kind: FenceSegmentType; woodCost: number; min?: number; max?: number }[]; totalBounds?: { min?: number; max?: number }; fixedWood: number; freeFences: number; borrowed: boolean; paymentBudget?: PaymentResourceMap }
  | { kind: 'resourceTransfer'; resources: Partial<Resource>; recipients: NonNullable<ChoiceDescriptionPreview['actor']>[]; payer?: NonNullable<ChoiceDescriptionPreview['actor']> }
  | { kind: 'ruleOperation'; operation: RuleOperationPreview }
  | { kind: 'unitCost'; resourcesPaid: Partial<Resource>; actionNameKey: string; unit?: 'room' | 'stable' | 'fence'; fixedFee?: Partial<Resource> }
  | { kind: 'occupationFees'; food: readonly number[] }
  | { kind: 'timedOperation'; operation: 'return-worker' | 'remove-worker' | 'release-held-worker' | 'skip-harvest' | 'skip-field-and-breed' | 'exclusive-use-expires'; actionNameKey?: string }
  | { kind: 'formulaGain'; resources: Readonly<Partial<Record<keyof Resource, RuleAmount>>> }
  | { kind: 'rule'; description: ChoiceDescriptionPreview }
  | { kind: 'actionCosts'; actionNameKey: string; options: { amount: number; paymentOptions: Extract<ChoiceEffectPreview, { kind: 'payment' }>[] }[] }
  | { kind: 'fieldContents'; resources: Partial<Resource>; sourceCard?: string }
  | { kind: 'cardScore'; cardId: string; delta: number }
  | { kind: 'actionSpace'; spaceId: string; nameKey: string; description?: ChoiceDescriptionPreview }
  | { kind: 'futureOffers'; entries: { round: number; resources: Partial<Resource>; resourcesPaid: Partial<Resource>; actionNameKey?: string }[] }
  | { kind: 'resourceMovement'; resources: Partial<Resource>; from: ChoiceResourceLocation; to: ChoiceResourceLocation }
  | {
      kind: 'futureSchedule'
      entries: {
        round: number
        endRound?: number
        resources: Partial<Resource>
        actions?: { kind: 'field' | 'stable' | 'forest' | 'moor'; amount: number; resourcesPaid?: Partial<Resource> }[]
        resourceCondition?: { kind: 'min-resource'; resource: keyof Resource; amount: number }
        roomType?: FutureMeepleRoomType
      }[]
    }
  | {
      kind: 'resourceExchange'
      resourcesPaid?: PaymentResourceMap
      resourcesGained?: Partial<Resource>
      bonusVp?: number
    }
  | {
      kind: 'payment'
      resourcesPaid?: PaymentResourceMap
      cardUsed?: string
      /** Card ids whose modifiers contributed to this payment (bonus.sources + trade.sourceId). */
      sourceCards?: string[]
    }
  | {
      kind: 'text'
      text: string
    }

export type ChoiceDescriptionPreview =
  ({ kind: 'conditional'; condition: RuleCondition; body: ChoiceDescriptionPreview } | {
      kind: 'action'
      showLabel?: boolean
      labelKey: string
      labelParams?: Record<string, unknown>
      effectPreview?: ChoiceEffectPreview
    }
  | {
      kind: 'group'
      labelKey?: string
      labelParams?: Record<string, unknown>
      operator: 'sequence' | 'xor' | 'or' | 'parallel'
      separator: string
      parts: ChoiceDescriptionPreview[]
    }) & {
      optional?: boolean
      workerPlacement?: 'sick-preferred'
      actor?: { playerId: string; name: string; nameIsDefault: boolean; index: number }
    }

export type ChoiceFarmPosition = FarmTilePosition & { sourceCard?: string; cardFieldSlot?: number }
export type ChoiceFarmTarget =
  | { kind: 'farm-cell'; playerId: string; positions: ChoiceFarmPosition[] }
  | { kind: 'logical-field'; playerId: string; fieldId: string; positions: ChoiceFarmPosition[]; resources: Partial<Resource> }

export type ActionChoiceOption = {
  value: string
  labelKey: string
  /** A selected entity's name remains visible alongside its consequence tree. */
  labelRole?: 'identity'
  labelParams?: Record<string, unknown>
  sourceCard?: string
  effectPreview?: ChoiceEffectPreview
  descriptionPreview?: ChoiceDescriptionPreview
  /** Legal displayed targets bound to this opaque choice, declared by the backend. */
  quantityLimit?: number
  target?: ChoiceFarmTarget
  targetCard?: { cardId: string; actionNameKeys: string[] }
  /** When true, UI greys out the option and server rejects attempts to pick it. */
  disabled?: boolean
  /** i18n key shown as tooltip explaining why the option is disabled. */
  disabledReasonKey?: string
}

/**
 * `extraData.actionContextWrite` (optional, plain object): when present on a
 * `{ type: 'request', request: { kind: 'choice' } }` result, the engine
 * shallow-merges its keys into `pendingInteractionContext.actionContext`,
 * which then surfaces in `pending.actionContext` via `engine.snapshot()`.
 * Used by ActionDef.resolveChoice to persist commit-time payload (e.g. fence
 * geometry) across a payment-combo second prompt round-trip. Key conflicts:
 * later writes overwrite earlier.
 *
 * Lifecycle: only consumed when the result type is 'request' (which produces
 * a new pending). For 'ok' / 'fail' / 'flow' results the field is ignored
 * because pending is being cleared or transformed differently.
 *
 * Writes are shallow: top-level keys are merged, nested objects replace (not deep-merge).
 * Use plain JSON-serializable values; Map/Set/Date are not preserved across snapshot/rehydrate.
 */
export type InternalActionChild = {
  actionId: string
  params?: Record<string, unknown>
  sourceCard?: string
  actionContext?: ActionContext
  resultKey?: string
  paymentInfoFrom?: string
}

export type InternalActionChildren = {
  beforeHostListeners?: InternalActionChild[]
  afterHostCommitListeners?: InternalActionChild[]
  afterHostListeners?: InternalActionChild[]
}

/** A before reaction contributes to its original host, keyed by source. */
export type BeforeHostContextContribution = {
  key: string
  sourceCard: string
  value: Record<string, unknown>
}

/** The visible and covered layers changed at one coordinate by a terrain commit. */
export type FarmTerrainChange = FarmTilePosition & {
  before: Pick<FarmTerrainTile, 'kind' | 'covered'> | null
  after: Pick<FarmTerrainTile, 'kind' | 'covered'> | null
  fieldCreated: boolean
}
export type FarmTerrainOperationMode = 'place' | 'remove' | 'replace-kind' | 'replace-with-field' | 'cover'

export type StableConstruction = FarmTilePosition & { ordinal: number } & (
  | { kind: 'normal'; pieceId: number }
  | { kind: 'special'; sourceCardId: string }
)

/** Structural farm properties shared by receipts and the production write boundary. */
export const FARM_LAYOUT_KEYS = ['roomTiles', 'stableTiles', 'fields', 'fenceSegments', 'pastures', 'farmTerrain', 'farmyardExtensions', 'farmyardSpaceStates'] as const satisfies readonly (keyof PlayerState)[]

/** A transient receipt of one committed farm operation, owned by its action host. */
export type FarmOperationResult = {
  playerId: string
  positions: FarmTilePosition[]
  sourceCardId?: string
  newlyUsedTiles: Array<FarmTilePosition & { playerId: string }>
  before: Pick<PlayerState, typeof FARM_LAYOUT_KEYS[number]>
  after: Pick<PlayerState, typeof FARM_LAYOUT_KEYS[number]>
} & (
  | { kind: 'rooms'; roomType: PlayerState['houseType'] }
  | { kind: 'stables'; stables: StableConstruction[] }
  | { kind: 'plow' | 'fence' | 'pastures' | 'space-states' | 'extension' | 'remove-stables' | 'remove-fences' | 'crops' }
  | { kind: 'terrain'; terrainMode: FarmTerrainOperationMode; terrainChanges: FarmTerrainChange[] }
)

export type ActionExecutionResult =
  | { type: 'ok'; personUse?: PersonUseReceipt; resourcesGained?: Partial<Resource>; resourcesPaid?: PaymentResourceMap; extraData?: Record<string, unknown>; internalChildren?: InternalActionChildren; beforeHostContributions?: BeforeHostContextContribution[]; farmOperations?: FarmOperationResult[] }
  | { type: 'request'; request: InteractionRequest; promptKey?: PromptKey; promptParams?: Record<string, unknown>; sourceCard?: string; extraData?: Record<string, unknown> }
  | { type: 'fail'; errorKey: string; recoverable?: boolean }
  | { type: 'flow'; flow: ActionFlow; personUse?: PersonUseReceipt; extraData?: Record<string, unknown>; farmOperations?: FarmOperationResult[] }
/** Permissions for this waiting step; declarations do not flow into nested steps. */
export type AnytimeWindow = { allowed: true; blockedIds?: string[] } | { allowed: false }

export type ActionFlow = (
  | {
      type: 'leaf'
      actionId: string
      optional?: boolean
      promptKey?: PromptKey
      params?: Record<string, unknown>
      sourceCard?: string
      actionContext?: ActionContext
      optionId?: string
      choiceLabelKey?: string
      choiceLabelParams?: Record<string, unknown>
      effectPreview?: ChoiceEffectPreview
      /**
       * Runs this flow node under another player when compiled into the
       * runtime engine. Card-facing flows describe ownership as metadata.
       */
      targetPlayerId?: string
      /**
       * Opt-in: when true and `registry.get(actionId).flow` exists, the engine
       * expands this leaf into the action's inner flow subtree (mirroring
       * `createEngine(actionId)` semantics). The outer leaf's `actionContext`
       * and `sourceCard` are merged into every inner leaf so downstream
       * listeners still see jump metadata. When false (default) or when the
       * action has no inner flow, the engine falls back to the standard
       * `ActionNode(actionId)` path.
       */
      expandFlow?: boolean
      /** Native entry; completePlacement supplies the callback when no place-farmer host owns it. */
      spaceUse?: ActionSpaceUseContext & { completePlacement?: true }
      /** Native settlement after effects, before the primary completion window. */
      completionBarrier?: true
    }
  | ({
      /** Keep the decision open and refresh unselected branches after anytime actions. */
      requiresExplicitChoice?: boolean
      anytimeActionId?: string
      anytimeActivation?: AnytimeActivation
      promptKey?: PromptKey
      children: ActionFlow[]
      optionId?: string
      optional?: boolean
      mode?: 'all' | 'trigger-select'
      triggerSelectOnce?: boolean
      sourceCard?: string
      choiceLabelKey?: string
      choiceLabelParams?: Record<string, unknown>
      /**
       * Runs this flow node under another player when compiled into the
       * runtime engine. Card-facing flows describe ownership as metadata.
       */
      targetPlayerId?: string
    } & ({ type: 'seq'; moorCompletion?: MoorCompletionFrame } | { type: 'or' | 'xor' | 'parallel' }))
 ) & { anytimeWindow?: AnytimeWindow }

export type ActionDefinition = {
  baseDescriptionPreview?: ChoiceDescriptionPreview
  id: string
  nameKey: string
  descriptionKey: string
  rulesKey?: string
  roundAvailable: number
  gainPerRound: Partial<Resource>
  players?: number[]
  linkedGroupId?: string
  maxOccupancy?: number | null
  strictCanExecute?: boolean
  /** Mark as an anytime action that can interrupt the current flow. */
  anytime?: boolean
  allowAnytimeReentry?: boolean
  idleOnly?: boolean
  canBeExecutedByPlayer: CanBeExecutedByPlayer
  /** Structural eligibility of the original body; independent replacement flows remain available. */
  originalActionCondition?: (context: ActionExecutionContext) => boolean
  /** Non-payment eligibility for an explicit optional decision; never authorizes execution. */
  canBeOfferedByPlayer?: CanBeExecutedByPlayer
  isAlreadySatisfied?: (
    context: ActionExecutionContext & { transactionEvents: readonly GameEvent[] },
  ) => boolean
  costPreview?: ActionCostPreview
  /** Pure description of this shared primitive, derived from its executable rule parameters. */
  previewEffect?: (context: ActionExecutionContext) => ChoiceEffectPreview | undefined
  /** Pure native pending refresh after an interrupting action changes legality. */
  projectInteractionRequest?: (state: GameState, player: PlayerState, request: InteractionRequest) => InteractionRequest
  /** Pure executable plan, also used for descriptions. Base mode includes all potential branches. */
  flowFactory?: (context: ActionFlowPlanningContext) => ActionFlow | undefined
  execute: (context: ActionMutationContext) => ActionExecutionResult
  resolveChoice?: (
    context: ActionMutationContext,
    choice: string,
    payload?: Record<string, unknown>,
  ) => ActionExecutionResult
  completeInternalChildren?: (
    context: ActionMutationContext,
    result: Extract<ActionExecutionResult, { type: 'ok' }>,
    internalResults: Record<string, ActionExecutionResult>,
  ) => Extract<ActionExecutionResult, { type: 'ok' }>
  /**
   * Opt-out: when true the engine builds a bare ActionNode instead of the
   * default pending-choice wrap that is normally
   * triggered by the presence of `resolveChoice`. Used by leaf actions whose
   * `execute` typically returns `ok` (so a paired pending host would dangle
   * empty and block the seq), and which only emit `choice` for one specific
   * branch (handled via the engine's fallback pending host id
   * path that already routes the player choice back through `resolveChoice`).
   * Currently set on the `pay` leaf — typed-flat costs resolve eagerly while
   * ComplexCost multi-solution still emits a payment choice.
   */
  skipChoiceWrap?: boolean
  /**
   * Opt-in: when defined, the engine bypasses `execute()` and instead builds a
   * choice from `getBaseChoiceOptions(ctx)` merged with hook-injected
   * `extraOptions` from the `computeChoiceCandidates` phase. The merged list is
   * filtered for affordability via the action's cost preview (with
   * `params.selectedOption` injected). The engine then:
   *   - 0 affordable options → returns a `fail` result with `noChoiceLogKey`.
   *   - 1 affordable option   → auto-resolves by invoking `resolveChoice(ctx, value)`.
   *   - ≥2 affordable options → emits a `choice` result with `choicePromptKey`.
   * The chosen value is also written back into `params.selectedOption` for the
   * `resolveChoice` call.
   */
  getBaseChoiceOptions?: (
    context: ActionExecutionContext,
  ) => ActionChoiceOption[]
  /** Prompt key used when `getBaseChoiceOptions` produces a multi-option choice. */
  choicePromptKey?: PromptKey
  /** Log key used when no candidate is affordable in the opt-in choice path. */
  noChoiceLogKey?: string
  /**
   * Opt-in: when this action runs as a non-top-level leaf inside a parent
   * action (e.g. the renovate-house leaf inside `house-redevelopment`'s
   * SEQ), the session emits a partial `log.actionDetail` immediately on
   * completion using this action's `nameKey`, then advances the snapshot
   * baseline so subsequent leaves and the final aggregate don't double-log
   * the same effect. Leave undefined for actions that should be folded into
   * the wrapping action's final aggregate detail (default behavior).
   */
  emitLeafActionDetail?: boolean
  flow?: ActionFlow
}

export type ActionSpace = ActionDefinition & {
  resources: Resource
  takenBy: WorkerRef[]
  blockedBy?: BlockedActionSpaceRef[]
  exclusiveUse?: { playerId: string; sourceCardId: string; untilRound: number }
}

export type ResourceBatchExchangePayload = {
  discard: Partial<Record<keyof Resource, number>>
  receive: Partial<Record<keyof Resource, number>>
}

export type FeedQueueEntry = {
  index: number
}

export type FeedExchangeCatalogEntry = {
  sourceId: string
  exchangeIndex: number
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  fromFarmyard?: boolean
}

export type SubFlowKind =
  | 'choice'
  | 'animal-reorg'
  | 'confirm-next-player'
  | 'confirm-player-switch'
  | 'feed'
  | 'heating'
  | 'farm-select'
  | 'selection'
  | 'card-draft'
  | 'engine-blocked'
  | 'resource-quantity-select'
  | 'resource-batch-exchange-select'

export type FarmSelectType = 'plow' | 'sow' | 'fence' | 'room' | 'stable'
export type SelectionKind = 'farm-position' | 'occupation-hand'

/** Bounded subsets of choice options, submitted as prefix + comma-separated values. */
export type ChoiceMultiSelect = {
  valuePrefix: string
  minSelections: number
  maxSelections: number
}

export type InteractionRequest = (
  | { kind: 'solo-hand-selection'; groups: SoloHandSelectionGroup[] }
  | { kind: 'choice'; options: ActionChoiceOption[]; multiSelect?: ChoiceMultiSelect; structuredChoicePrefixes?: string[]; requiresExplicitChoice?: boolean; moorSolo?: MoorSoloChoice }
  | { kind: 'animal-reorg'; zones: InteractionAnimalReorgZone[]; prefill?: boolean }
  | { kind: 'confirm-next-player'; nextPlayerIndex: number }
  | { kind: 'confirm-player-switch'; fromPlayerIndex: number; toPlayerIndex: number }
  | {
      kind: 'feed'
      remaining: number
      foodUsed: number
      feedQueue?: FeedQueueEntry[]
      exchangeCatalog?: FeedExchangeCatalogEntry[]
      maxTradeTimesBySourceId?: Record<string, number>
      placedAnimals?: Partial<Pick<Resource, AnimalKey>>
    }
  | {
      kind: 'heating'
      playerId: string
      required: number
      requiredWithWoodConversion: number
      maxNewSickWorkers: number
      exchangeCatalog: FeedExchangeCatalogEntry[]
      placedAnimals: Partial<Pick<Resource, AnimalKey>>
      feedQueue?: FeedQueueEntry[]
    }
  | {
      kind: 'farm-select'
      farm:
        | { farmType: 'plow'; selectableTiles: FarmTilePosition[] }
        | {
            farmType: 'sow'
            selectableFields: {
              tile: FarmTilePosition
              allowedCrops: ('grain' | 'vegetable' | 'wood' | 'stone')[]
              sourceCard?: string
              groupKey?: string
            }[]
            minSelections?: number
            maxSelections?: number
            /** Maximum seed placements, independently of logical-field groups. */
            maxSeedSelections?: number
          }
        | {
            farmType: 'fence'
            selectableEdges: string[]
            fenceSource?: { kind: 'borrowed'; donorCaps: Record<string, number> }
          }
        | { farmType: 'room'; selectableTiles: FarmTilePosition[]; maxSelections: number }
        | {
            farmType: 'stable'
            selectableTiles: FarmTilePosition[]
            maxSelections: number
            farmHandPositions?: FarmTilePosition[]
          }
      options?: ActionChoiceOption[]
    }
  | {
      kind: 'selection'
      selection: InteractionSelection
      options?: ActionChoiceOption[]
    }
  | {
      kind: 'card-draft'
      mode: 'simultaneous'
      round: number
      totalRounds: number
      poolSize: number
      seatOrder: string[]
      pools: Record<string, { occ: string[]; minor: string[] }>
      pendingPicks: string[]
      kept: Record<string, { occ: string[]; minor: string[] }>
    }
  | {
      kind: 'select-trigger'
      ownerPlayerId: string
      options: ActionChoiceOption[]
    }
  | {
      kind: 'engine-blocked'
      actionId: string
      reasonKey?: PromptKey
    }
  | {
      kind: 'resource-quantity-select'
      cardId: string
      availableByResource: Partial<Record<keyof Resource, number>>
      promptKey?: string
      requireAtLeastOne?: boolean
    }
  | {
      kind: 'resource-batch-exchange-select'
      cardId: string
      discardAvailableByResource: Partial<Record<keyof Resource, number>>
      receiveResources: readonly (keyof Resource)[]
      maxTotal: number
      promptKey?: string
      requireAtLeastOne?: boolean
    }
) & { anytimeWindow?: AnytimeWindow }

export type InteractionCommand =
  | 'submitSoloHandSelection'
  | 'takeAction'
  | 'resolveChoice'
  | 'commitSelection'
  | 'takeAnytimeAction'
  | 'undoStep'
  | 'undoAction'

export type AnytimeAction = {
  id: string
  labelKey: string
  labelParams?: Record<string, unknown>
  actionId?: string
  sourceCard?: string
  descriptionPreview?: ChoiceDescriptionPreview
}

export type InteractionAnimalReorgZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable' | 'card'
  cardId?: string
  ownerPlayerId?: string
  animalOwnerPlayerId?: string
  displayOwnerName?: string
  animalType: AnimalKey | null
  animalCount: number
  animalCounts?: Partial<Record<AnimalKey, number>>
  allowedAnimalType?: AnimalKey | null
  allowedAnimalTypes?: AnimalKey[]
  capacity: number
  farmPosition?: FarmTilePosition
  countsFarmyardSpaceAsUnused?: boolean
  displaySource?: 'played-card' | 'farm-position' | 'borrowed-played-card'
  occupancyGroup?: string
  occupiedZoneLimit?: number
  requiredEmptyZoneGroupIds?: string[]
}

export type InteractionFarmSelection =
  | {
      farmType: 'fence'
      selectableEdges: string[]
      fenceSource?: { kind: 'borrowed'; donorCaps: Record<string, number> }
    }
  | {
      farmType: 'room'
      selectableTiles: FarmTilePosition[]
      maxSelections: number
    }
  | {
      farmType: 'stable'
      selectableTiles: FarmTilePosition[]
      maxSelections: number
      farmHandPositions?: FarmTilePosition[]
    }
  | {
      farmType: 'plow'
      selectableTiles: FarmTilePosition[]
    }
  | {
      farmType: 'sow'
      selectableFields: {
        tile: FarmTilePosition
        allowedCrops: ('grain' | 'vegetable' | 'wood' | 'stone')[]
        sourceCard?: string
        groupKey?: string
      }[]
      minSelections?: number
      maxSelections?: number
      /** Maximum seed placements, independently of logical-field groups. */
      maxSeedSelections?: number
    }

export type FarmPositionSelectionTarget = FarmTilePosition & {
  sourceCard?: string
  groupKey?: string
  cardFieldSlot?: number
}

export type InteractionSelection =
  | {
      kind: 'farm-position'
      selectablePositions: FarmPositionSelectionTarget[]
      maxSelections: number
      minSelections?: number
      allowedSelectionCounts?: number[]
      validPositionGroups?: FarmTilePosition[][]
    }
  | {
      kind: 'occupation-hand'
      selectableCards: string[]
      minSelections: number
      maxSelections: number
    }

type InteractionBase = {
  allowedCommands: InteractionCommand[]
  anytimeActions: AnytimeAction[]
}

export type PlayerScoreSummaryLite = {
  playerId: string
  total: number
}

export type InteractionState =
  | (InteractionBase & { stateId: 'idle' })
  | (InteractionBase & {
      stateId: 'wait'
      /** Opaque identity of the pending step, stable when its candidates refresh. */
      requestKey?: string
      playerIndex: number
      spaceId?: string
      promptKey?: PromptKey
      promptParams?: Record<string, unknown>
      sourceCard?: string
      request: InteractionRequest
      rejectedCommandKeys?: string[]
    })
  | (InteractionBase & {
      stateId: 'gameover'
      winners?: string[]
      scores?: PlayerScoreSummaryLite[]
    })
