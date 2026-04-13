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

export type Field = {
  crop: 'grain' | 'vegetable' | null
  remaining: number
  row: number
  col: number
}

export type PlayerState = {
  id: string
  name: string
  color: 'red' | 'yellow' | 'blue' | 'black'
  resources: Resource
  familySize: number
  workersAvailable: number
  rooms: number
  houseType: 'wood' | 'clay' | 'stone'
  fields: Field[]
  fences: number
  roomTiles: FarmTilePosition[]
  stableTiles: FarmTilePosition[]
  improvements: string[]
  minorHand: string[]
  minorPlayed: string[]
  occupationHand: string[]
  occupationPlayed: string[]
  playedCards: string[]
  houseAnimalType: 'sheep' | 'boar' | 'cattle' | null
  houseAnimalCount: number
  stableAnimals: Record<string, 'sheep' | 'boar' | 'cattle' | null>
  newbornCount: number
  pastures: Pasture[]
  fenceSegments: string[]
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

export type FutureMeepleRequest = {
  cardId: string
  playerId: string
  startRound: number
  count: number
  resources: Partial<Resource>
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

export type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, unknown>
}

export type ActionExecutionResult =
  | { type: 'ok'; logKey?: string; resourcesGained?: Partial<Resource>; logParams?: Record<string, unknown>; extraData?: Record<string, unknown> }
  | { type: 'choice'; promptKey?: string; promptParams?: Record<string, unknown>; options: ActionChoiceOption[] }
  | { type: 'animalReorg'; sourceId: string }
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow }
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
    }
  | {
      type: 'seq' | 'or' | 'xor' | 'parallel'
      promptKey?: string
      children: ActionFlow[]
      optional?: boolean
      choiceLabelKey?: string
      choiceLabelParams?: Record<string, unknown>
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
  flow?: ActionFlow
}

export type ActionSpace = ActionDefinition & {
  resources: Resource
  takenBy: string | null
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
        allowedCrops: ('grain' | 'vegetable')[]
      }[]
      maxSelections?: number
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
    })
  | (InteractionBase & {
      stateId: 'farmSelect'
      playerIndex: number
      spaceId: string
      promptKey?: string
      promptParams?: Record<string, unknown>
      options: ActionChoiceOption[]
      costOverride?: Partial<Resource>
      farm: InteractionFarmSelection
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
