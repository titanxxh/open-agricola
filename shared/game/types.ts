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
// shared/game/resource-keys.ts for the runtime list / discriminator.
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

export type Trade = {
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  source?: string
  sourceId?: string
  sideEffect?: TradeSideEffect
}

export type BonusChoice = {
  discount: Partial<Resource>
  sources?: string[]
  conditions?: Record<string, number>
}

export type Bonus = {
  discount?: Partial<Resource>
  choices?: BonusChoice[]
  optional?: boolean
  sources?: string[]
  conditions?: Record<string, number>
}

export type CostModifierType = 'construct' | 'renovation' | 'occupation' | 'fencing' | 'stables' | 'plow'

export type TradeModifier = {
  type: 'trade'
  cardId: string
  appliesTo: CostModifierType[]
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
}

export type BonusModifier = {
  type: 'bonus'
  cardId: string
  appliesTo: CostModifierType[]
  discount?: Partial<Resource>
  choices?: BonusChoice[]
  optional?: boolean
  conditions?: Record<string, number>
}

export type CostModifier = TradeModifier | BonusModifier

export type ComplexCost = {
  fee?: Partial<Resource>
  fees?: Partial<Resource>[]
  trades?: Trade[]
  cards?: { type: string; list: string[]; cost?: Partial<Resource>; required?: boolean }
  bonuses?: Bonus[]
}

export type PaymentSolution = {
  resourcesPaid: Partial<Resource>
  tradesUsed: { trade: Trade; times: number }[]
  cardUsed?: string
  bonusUsed?: string
  feeIndex?: number
}

export type PaymentSource = 'reserve' | 'field' | 'card'

export type CropStack = {
  kind: 'grain' | 'vegetable'
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

export type ImmediateLogEntry = {
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

export type FutureMeepleRequest =
  | {
      cardId: string
      playerId: string
      startRound: number
      count: number
      resources: Partial<Resource>
    }
  | {
      cardId: string
      playerId: string
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

export type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, unknown>
  sourceCard?: string
  effectPreview?: ChoiceEffectPreview
  /** When true, UI greys out the option and server rejects attempts to pick it. */
  disabled?: boolean
  /** i18n key shown as tooltip explaining why the option is disabled. */
  disabledReasonKey?: string
}

export type ActionExecutionResult =
  | { type: 'ok'; logKey?: string; resourcesGained?: Partial<Resource>; resourcesPaid?: Partial<Resource>; logParams?: Record<string, unknown>; immediateLogs?: ImmediateLogEntry[]; extraData?: Record<string, unknown> }
  | { type: 'choice'; promptKey?: string; promptParams?: Record<string, unknown>; options: ActionChoiceOption[] }
  | { type: 'animalReorg'; sourceId: string }
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow; logKey?: string; logParams?: Record<string, unknown>; immediateLogs?: ImmediateLogEntry[]; extraData?: Record<string, unknown> }
export type ActionFlow =
  | {
      type: 'leaf'
      actionId: string
      optional?: boolean
      promptKey?: string
      params?: Record<string, unknown>
      sourceCard?: string
      actionContext?: Record<string, unknown>
      choiceLabelKey?: string
      choiceLabelParams?: Record<string, unknown>
      effectPreview?: ChoiceEffectPreview
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
      promptKey?: string
      children: ActionFlow[]
      optional?: boolean
      choiceLabelKey?: string
      choiceLabelParams?: Record<string, unknown>
    }
  | {
      type: 'playerSwitch'
      targetPlayerId: string
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
  execute: (context: ActionExecutionContext) => ActionExecutionResult
  resolveChoice?: (
    context: ActionExecutionContext,
    choice: string,
  ) => ActionExecutionResult
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
  choicePromptKey?: string
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
}

export type PendingAction =
  | {
      type: 'choice'
      playerIndex: number
      spaceId: string
      options: ActionChoiceOption[]
      promptKey?: string
      promptParams?: Record<string, unknown>
      costOverride?: Partial<Resource>
      sourceCard?: string
      actionContext?: Record<string, unknown>
    }
  | { type: 'animalReorg'; playerIndex: number; spaceId: string }
  | {
      type: 'harvestFeed'
      playerIndex: number
      remaining: number
      foodUsed: number
      feedQueue?: { index: number; remaining: number; foodUsed: number }[]
    }
  | { type: 'confirmNextPlayer'; nextPlayerIndex: number }
  | { type: 'confirmPlayerSwitch'; fromPlayerIndex: number; toPlayerIndex: number }
  | { type: 'cardDraft'; round: number; totalRounds: number; allSubmitted: boolean }
  | { type: 'none' }

export type InteractionCommand =
  | 'takeAction'
  | 'resolveChoice'
  | 'commitFarm'
  | 'commitSelection'
  | 'takeAnytimeAction'
  | 'confirmReorg'
  | 'confirmFeed'
  | 'confirmNextPlayer'
  | 'confirmPlayerSwitch'
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
        allowedCrops: ('grain' | 'vegetable' | 'wood')[]
        sourceCard?: string
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

export type InteractionState =
  | (InteractionBase & { stateId: 'idle' })
  | (InteractionBase & {
      stateId: 'choice'
      playerIndex: number
      spaceId: string
      promptKey?: string
      promptParams?: Record<string, unknown>
      options: ActionChoiceOption[]
      costOverride?: Partial<Resource>
      sourceCard?: string
    })
  | (InteractionBase & {
      stateId: 'farmSelect'
      playerIndex: number
      spaceId: string
      promptKey?: string
      promptParams?: Record<string, unknown>
      options: ActionChoiceOption[]
      costOverride?: Partial<Resource>
      sourceCard?: string
      farm: InteractionFarmSelection
    })
  | (InteractionBase & {
      stateId: 'selection'
      playerIndex: number
      spaceId: string
      promptKey?: string
      promptParams?: Record<string, unknown>
      options: ActionChoiceOption[]
      costOverride?: Partial<Resource>
      sourceCard?: string
      selection: InteractionSelection
    })
  | (InteractionBase & {
      stateId: 'animalReorg'
      playerIndex: number
      spaceId: string
      zones: InteractionAnimalReorgZone[]
    })
  | (InteractionBase & {
      stateId: 'harvestFeed'
      playerIndex: number
      remaining: number
      foodUsed: number
      feedQueue?: { index: number; remaining: number; foodUsed: number }[]
    })
  | (InteractionBase & {
      stateId: 'confirmNextPlayer'
      nextPlayerIndex: number
    })
  | (InteractionBase & {
      stateId: 'confirmPlayerSwitch'
      fromPlayerIndex: number
      toPlayerIndex: number
    })
