import type { PromptKey } from './prompt-keys'
import type { EventSink, GameEvent, PublicEventArchivePacket } from './events'
import type { PrivateGameEvent } from './private-events'

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
  begging: number
}

export type SupplyTokenKey = 'fence' | 'stable'
export type SupplyTokenCounts = Partial<Record<SupplyTokenKey, number>>
export type PaymentResource = Resource & Record<SupplyTokenKey, number>
export type CardProvidedPaymentResourceKey = `${string}:${string}`
export type PaymentResourceKey = keyof PaymentResource | CardProvidedPaymentResourceKey
export type PaymentResourceMap = Partial<Record<PaymentResourceKey, number>>
export type FutureMeepleResourceMap = Partial<Resource> & { field?: number; stable?: number }

// Pseudo-resource map — used ONLY by CardResourceStats.gained to record
// BGA-style "Plows: N / Built: N rooms / Occupations played: N" lines via
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
  max?: number
  scope?: 'action' | 'unit'   // default 'action' (back-compat)
  groupId?: string
  groupMax?: number
  replaceUpTo?: boolean
  source?: string
  sourceId?: string
  sideEffect?: TradeSideEffect
}

export type BonusChoice = {
  discount: Partial<Resource>
  capDiscountAtCost?: boolean
  trackChoiceIndex?: boolean
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
  groupMax?: number
  replaceUpTo?: boolean
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
  optional?: boolean
  conditions?: Record<string, number>
  minCost?: Partial<Resource>
  maxCost?: Partial<Resource>
}

export type CostModifier = TradeModifier | BonusModifier

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
  cards?: { type: string; list: string[]; cost?: PaymentResourceMap; required?: boolean }
  bonuses?: Bonus[]
}

export type CostAttribution = {
  saved?: PaymentResourceMap
  paid?: PaymentResourceMap
}

export type CostAttributionBySource = Record<string, CostAttribution>

export type CardCostCandidateMetadata = {
  originalFeeIndex: number
  sources: string[]
  costAttribution?: CostAttributionBySource
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
  tradesUsed: { trade: Trade; times: number }[]
  cardUsed?: string
  bonusUsed?: string
  bonusChoiceIndex?: Record<string, number>
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

export type Worker = {
  id: string
  isActive: boolean
  isNewborn: boolean
  removedFromSupply?: boolean
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

export type FenceSegmentType = 'fence' | 'palisade'
export type FenceSegmentSource =
  | { kind: 'own'; ownerPlayerId: string }
  | { kind: 'borrowed'; ownerPlayerId: string }
export type FenceSegment = { edge: string; type: FenceSegmentType; source?: FenceSegmentSource }

export type PlayerState = {
  id: string
  name: string
  color: 'red' | 'yellow' | 'blue' | 'black'
  resources: Resource
  workers: Worker[]
  rooms: number
  houseType: 'wood' | 'clay' | 'stone'
  fields: Field[]
  roomTiles: FarmTilePosition[]
  stableTiles: FarmTilePosition[]
  improvements: string[]
  minorHand: string[]
  minorPlayed: string[]
  occupationHand: string[]
  occupationPlayed: string[]
  extraOccupationsFromCards: string[]
  playedCards: string[]
  houseAnimalType: 'sheep' | 'boar' | 'cattle' | null
  houseAnimalCount: number
  stableAnimals: Record<string, 'sheep' | 'boar' | 'cattle' | null>
  pastures: Pasture[]
  fenceSegments: FenceSegment[]
  majorEffects: MajorEffectState
  startPlayer: boolean
  activeModifiers: CostModifier[]
  cardStates: CardStates
  stats: PlayerStats
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
  _extraTurnSkipCount?: number
  _extraTurnConsumedCount?: number
}

export type FarmTilePosition = {
  row: number
  col: number
}

export type Pasture = {
  id: string
  size: number
  tiles: FarmTilePosition[]
  stables: number
  animalType: 'sheep' | 'boar' | 'cattle' | null
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
  actionContext?: Record<string, unknown>
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
      actionContext?: Record<string, unknown>
    }
  | {
      cardId: string
      playerId: string
      sourceSummary?: FutureMeepleSourceSummary
      entries: {
        round: number
        resources?: FutureMeepleResourceMap
        roomType?: FutureMeepleRoomType
        actionContext?: Record<string, unknown>
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
   * Positions of every field tile that produced a crop in this reap pass.
   * Mirror of BGA `getHarvestedFieldTilePositions($crops)`. Cards like
   * D63 Lynchet need exact tile positions, not just totals — using only
   * grain/vegetable counts loses information when the player has multiple
   * fields of the same crop type.
   */
  harvestedPositions?: { row: number; col: number }[]
}

export type HarvestBreedSummary = {
  resources: Partial<Resource>
  animalTypes: number
  animalCount: number
}

export type RoundPhase = 'preparation' | 'work' | 'returning-home' | 'harvest' | 'field' | 'feeding' | 'breeding'

export type GameState = {
  round: number
  /** Top-level game phase. 'draft' while card draft is in progress; 'playing' for the normal game. */
  phase: 'draft' | 'playing'
  /** Round sub-phase (preparation/work/returning-home/harvest/field/feeding/breeding). */
  roundPhase: RoundPhase
  /** Draft state when `phase === 'draft'`, otherwise null. */
  draft: import('../draft/types').DraftState | null
  currentPlayerIndex: number
  players: PlayerState[]
  actionSpaces: ActionSpace[]
  log: LogEntry[]
  events: GameEvent[]
  nextEventSeq: number
  publicEventArchive: PublicEventArchivePacket[]
  nextPublicEventArchivePacketSeq: number
  roundStartSnapshot: GameState | null
  roundActionOrder: (string | null)[]
  gameSeed: number
  /** Monotonic counter incremented every time a card consumes randomness. */
  rngTick?: number
  /** One-shot flag: cards set this before emitting a pending-choice that must not be undone across.
   * GameSession.pushHistory reads, honors, and clears this flag. */
  pendingUndoBoundary?: boolean
  availableMajorImprovements: string[]
  futureMeeples: FutureMeeple[]
  pendingFutureMeeples: FutureMeepleRequest[]
  gameOver: boolean
  /** When true, community-deck cards are included in the deal pool. */
  enableCommunityDeck: boolean
  workPhaseObtainedResources: Record<string, Partial<Resource>>
  harvestReapSummary?: Record<string, HarvestReapSummary>
  harvestBreedSummary?: Record<string, HarvestBreedSummary>
  /**
   * Number of feeding phases that have completed (incremented once at the
   * start of each breeding phase, after all players have fed).
   * Consumed by A148_Woolgrower / B86_TruffleSearcher animal capacity.
   * Mirrors BGA `Globals::getCompletedFeedingPhases()`.
   */
  completedFeedingPhases: number
}

export type CanBeExecutedByPlayerContext = {
  /**
   * The card id that originated this action invocation, if any. Forwarded so
   * doable checks can route through the same per-card cost/effect modifiers
   * that pay-time uses (e.g. D95 Site Manager treats `actionCardId === 'D95_SiteManager'`
   * as the trigger for its food-for-resource substitution).
   */
  sourceCard?: string
  /**
   * Listener-driven actionContext (e.g. `tradeIds` for E53 BoarSpear's
   * listener-only exchange). Sprint 6b: forwarded so doable checks see the
   * same metadata the engine will pass to `execute()`.
   */
  actionContext?: Record<string, unknown>
}

export type CanBeExecutedByPlayer = (
  state: GameState,
  player: PlayerState,
  context?: CanBeExecutedByPlayerContext,
) => boolean

export type ActionAvailabilityContext = {
  state: GameState
  player: PlayerState
  space?: ActionSpace
  params?: Record<string, unknown>
  sourceCard?: string
}

export type ActionExecutionContext = {
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
  actionContext?: Record<string, unknown>
  emitPrivateEvent?: (event: PrivateGameEvent) => void
}

export type ActionMutationContext = ActionExecutionContext & {
  eventSink: EventSink
}

export type ActionCostPreview = {
  isStructurallyPossible?: (context: ActionAvailabilityContext) => boolean
  canExecute?: (
    context: ActionAvailabilityContext,
    costOverride?: Partial<Resource>,
  ) => boolean
  getBaseCost: (context: ActionAvailabilityContext) => Partial<Resource>
}

export type ChoiceEffectPreview =
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
  | {
      kind: 'action'
      labelKey: string
      labelParams?: Record<string, unknown>
      effectPreview?: ChoiceEffectPreview
    }
  | {
      kind: 'group'
      separator: string
      parts: ChoiceDescriptionPreview[]
    }

export type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, unknown>
  sourceCard?: string
  effectPreview?: ChoiceEffectPreview
  descriptionPreview?: ChoiceDescriptionPreview
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
  actionContext?: Record<string, unknown>
  resultKey?: string
  paymentInfoFrom?: string
}

export type InternalActionChildren = {
  beforeHostListeners?: InternalActionChild[]
  afterHostCommitListeners?: InternalActionChild[]
  afterHostListeners?: InternalActionChild[]
}

export type ActionExecutionResult =
  | { type: 'ok'; resourcesGained?: Partial<Resource>; resourcesPaid?: PaymentResourceMap; extraData?: Record<string, unknown>; internalChildren?: InternalActionChildren }
  | { type: 'request'; request: InteractionRequest; promptKey?: PromptKey; promptParams?: Record<string, unknown>; sourceCard?: string; extraData?: Record<string, unknown> }
  | { type: 'fail'; errorKey: string; recoverable?: boolean }
  | { type: 'flow'; flow: ActionFlow; extraData?: Record<string, unknown> }
export type ActionFlow =
  | {
      type: 'leaf'
      actionId: string
      optional?: boolean
      promptKey?: PromptKey
      params?: Record<string, unknown>
      sourceCard?: string
      actionContext?: Record<string, unknown>
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
    }
  | {
      type: 'seq' | 'or' | 'xor' | 'parallel'
      promptKey?: PromptKey
      children: ActionFlow[]
      optional?: boolean
      mode?: 'all' | 'trigger-select'
      sourceCard?: string
      choiceLabelKey?: string
      choiceLabelParams?: Record<string, unknown>
      /**
       * Runs this flow node under another player when compiled into the
       * runtime engine. Card-facing flows describe ownership as metadata.
       */
      targetPlayerId?: string
    }

export type ActionDefinition = {
  id: string
  nameKey: string
  descriptionKey: string
  roundAvailable: number
  gainPerRound: Partial<Resource>
  players?: number[]
  /** Mark as an anytime action that can interrupt the current flow. */
  anytime?: boolean
  canBeExecutedByPlayer: CanBeExecutedByPlayer
  costPreview?: ActionCostPreview
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
  exclusiveUse?: { playerId: string; sourceCardId: string; untilRound: number }
}

export type ResourceBatchExchangePayload = {
  discard: Partial<Record<keyof Resource, number>>
  receive: Partial<Record<keyof Resource, number>>
}

/**
 * Single entry in a harvest-feed queue: pinpoints which player still owes
 * food and how much, plus the food already consumed from that player's
 * mandatory pre-deduction (so the UI can display it). Used by the engine's
 * `InteractionRequest` `feed` payload and `GameCore.startFeedSubFlow`.
 */
export type FeedQueueEntry = {
  index: number
  remaining: number
  foodUsed: number
}

export type SubFlowKind =
  | 'choice'
  | 'animal-reorg'
  | 'confirm-next-player'
  | 'confirm-player-switch'
  | 'feed'
  | 'farm-select'
  | 'selection'
  | 'card-draft'
  | 'engine-blocked'
  | 'resource-quantity-select'
  | 'resource-batch-exchange-select'

export type FarmSelectType = 'plow' | 'sow' | 'fence' | 'room' | 'stable'
export type SelectionKind = 'farm-position' | 'occupation-hand'

export type InteractionRequest =
  | { kind: 'choice'; options: ActionChoiceOption[]; structuredChoicePrefixes?: string[] }
  | { kind: 'animal-reorg'; zones: InteractionAnimalReorgZone[] }
  | { kind: 'confirm-next-player'; nextPlayerIndex: number }
  | { kind: 'confirm-player-switch'; fromPlayerIndex: number; toPlayerIndex: number }
  | {
      kind: 'feed'
      remaining: number
      foodUsed: number
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
            maxSelections?: number
          }
        | {
            farmType: 'fence'
            selectableEdges: string[]
            extraWood?: number
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
      selection:
        | {
            selectionType: 'farm-position'
            selectablePositions: FarmTilePosition[]
            minSelections?: number
            maxSelections: number
          }
        | {
            selectionType: 'occupation-hand'
            selectableCards: string[]
            minSelections: number
            maxSelections: number
          }
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
      options: Array<{
        value: string
        labelKey: string
        labelParams?: Record<string, unknown>
        sourceCard?: string
      }>
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

export type InteractionCommand =
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
}

export type InteractionAnimalReorgZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable' | 'card'
  cardId?: string
  animalType: 'sheep' | 'boar' | 'cattle' | null
  animalCount: number
  capacity: number
}

export type InteractionFarmSelection =
  | {
      farmType: 'fence'
      selectableEdges: string[]
      extraWood?: number
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
      maxSelections?: number
    }

export type InteractionSelection =
  | {
      kind: 'farm-position'
      selectablePositions: FarmTilePosition[]
      maxSelections: number
      minSelections?: number
      allowedSelectionCounts?: number[]
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
      playerIndex: number
      spaceId?: string
      promptKey?: PromptKey
      promptParams?: Record<string, unknown>
      sourceCard?: string
      request: InteractionRequest
      // Transitional kind-specific accessor fields (Task 4 → cleaned up in Task 13).
      // Frontend / tests can read these directly while typed request handlers
      // replace stateId-specific branching.
      options?: ActionChoiceOption[]
      costOverride?: Partial<Resource>
      farm?: InteractionFarmSelection
      selection?: InteractionSelection
      zones?: InteractionAnimalReorgZone[]
      remaining?: number
      foodUsed?: number
      feedQueue?: FeedQueueEntry[]
      nextPlayerIndex?: number
      fromPlayerIndex?: number
      toPlayerIndex?: number
    })
  | (InteractionBase & {
      stateId: 'gameover'
      winners?: string[]
      scores?: PlayerScoreSummaryLite[]
    })
