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

export type ResourceKey = keyof Resource

export type Trade = {
  from: Partial<Resource>
  to: Partial<Resource>
  max?: number
  source?: string
  sourceId?: string
}

export type Bonus = {
  discount: Partial<Resource>
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
  discount: Partial<Resource>
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
  paid: Partial<Resource>
  gained: Partial<Resource>
}

export type CardStates = Record<string, CardState>

export type LogEntry = {
  key: string
  params?: Record<string, unknown>
}

export type FutureMeeple = {
  id: string
  cardId: string
  playerId: string
  round: number
  actionId: string | null
  resources: Partial<Resource>
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
      entries: { round: number; resources: Partial<Resource> }[]
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
  phase: RoundPhase
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
  workPhaseObtainedResources: Record<string, Partial<Resource>>
  harvestReapSummary?: Record<string, HarvestReapSummary>
  harvestBreedSummary?: Record<string, HarvestBreedSummary>
}

export type CanBeExecutedByPlayer = (
  state: GameState,
  player: PlayerState,
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
  | { type: 'ok'; logKey?: string; resourcesGained?: Partial<Resource>; resourcesPaid?: Partial<Resource>; logParams?: Record<string, unknown>; extraData?: Record<string, unknown> }
  | { type: 'choice'; promptKey?: string; promptParams?: Record<string, unknown>; options: ActionChoiceOption[] }
  | { type: 'animalReorg'; sourceId: string }
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow; extraData?: Record<string, unknown> }
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
