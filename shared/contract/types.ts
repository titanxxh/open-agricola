import type { PromptKey } from './prompt-keys'
import type { EventSink, GameEvent } from './events'

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

export type TradeSideEffect =
  | { type: 'drainSpace'; spaceId: string; resource: ResourceKey }
  | { type: 'bonusVp'; amount: number }
  | { type: 'pushExtraDataValue'; sourceCard: string; key: string; value: string }

export type Trade = {
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  scope?: 'action' | 'unit'   // default 'action' (back-compat)
  replaceUpTo?: boolean
  order?: number
  source?: string
  sourceId?: string
  sideEffect?: TradeSideEffect
}

export type BonusChoice = {
  discount: Partial<Resource>
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
  replaceUpTo?: boolean
  order?: number
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
  optional?: boolean
  conditions?: Record<string, number>
  minCost?: Partial<Resource>
  maxCost?: Partial<Resource>
}

export type CostModifier = TradeModifier | BonusModifier

export type ComplexCost = {
  fee?: Partial<Resource>
  fees?: Partial<Resource>[]
  unitFee?: Partial<Resource>      // per-unit cost; total fee += nb × unitFee
  nb?: number                       // unit count; construct=rooms, renovation=player.rooms
  trades?: Trade[]
  cards?: { type: string; list: string[]; cost?: Partial<Resource>; required?: boolean }
  bonuses?: Bonus[]
}

export type PaymentSolution = {
  resourcesPaid: Partial<Resource>
  tradesUsed: { trade: Trade; times: number }[]
  cardUsed?: string
  bonusUsed?: string
  bonusChoiceIndex?: Record<string, number>
  feeIndex?: number
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
}

export type WorkerRef = {
  playerId: string
  workerId: string
}

export type FenceSegmentType = 'fence' | 'palisade'
export type FenceSegment = { edge: string; type: FenceSegmentType }

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
  /**
   * Session-transient scratchpad: card ids of `BonusModifier` entries whose
   * `sources` fired during the currently-executing action. Initialised by
   * `GameCore` at action start and cleared at action end; appended by
   * `executePaymentSolution` when a bonus path is taken. Used only for
   * attributing the `log.actionDetail` entry to the triggering card.
   */
  _activeActionBonusSources?: string[]
  /**
   * Session-transient scratchpad written by the `pay` action leaf and
   * consumed by the immediately-following `apply-improvement` leaf. Holds
   * `resourcesPaid`, `feeIndex`, and `returnedCardId` for the pending
   * improvement build so that `activateCard(... 'onBuy', paymentInfo)` keeps
   * receiving the same `PaymentInfo` it did under the legacy
   * `playMajorImprovement` / `playMinorImprovement` mutate-in-place flow.
   * Cleared by `apply-improvement` after read.
   */
  _pendingImprovementPaymentInfo?: {
    resourcesPaid: Partial<Resource>
    feeIndex?: number
    returnedCardId?: string
  }
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
  resources: Partial<Resource>
  roomType?: FutureMeepleRoomType
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
      resources: Partial<Resource>
    }
  | {
      cardId: string
      playerId: string
      sourceSummary?: FutureMeepleSourceSummary
      entries: {
        round: number
        resources?: Partial<Resource>
        roomType?: FutureMeepleRoomType
      }[]
    }

export type HarvestReapSummary = {
  resources: Partial<Resource>
  grainFields: number
  vegetableFields: number
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
  params?: Record<string, unknown>
  sourceCard?: string
  actionContext?: Record<string, unknown>
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
      resourcesPaid?: Partial<Resource>
      resourcesGained?: Partial<Resource>
      bonusVp?: number
    }
  | {
      kind: 'payment'
      resourcesPaid?: Partial<Resource>
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
export type ActionExecutionResult =
  | { type: 'ok'; resourcesGained?: Partial<Resource>; resourcesPaid?: Partial<Resource>; extraData?: Record<string, unknown> }
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
        | { farmType: 'fence'; selectableEdges: string[]; extraWood?: number }
        | { farmType: 'room'; selectableTiles: FarmTilePosition[]; maxSelections: number }
        | { farmType: 'stable'; selectableTiles: FarmTilePosition[]; maxSelections: number }
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
  | 'commitFarm'
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
  zoneType: 'pasture' | 'house' | 'stable'
  animalType: 'sheep' | 'boar' | 'cattle' | null
  animalCount: number
  capacity: number
}

export type InteractionFarmSelection =
  | {
      farmType: 'fence'
      selectableEdges: string[]
      extraWood?: number
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
      // Frontend / tests can read these directly while we migrate callers off
      // the legacy stateId switches.
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
