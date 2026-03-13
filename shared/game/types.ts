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
}

export type CostModifier = TradeModifier | BonusModifier

export type ComplexCost = {
  fee?: Partial<Resource>
  fees?: Partial<Resource>[]
  trades?: Trade[]
  cards?: { type: string; list: string[]; cost?: Partial<Resource> }
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
  counters?: Record<string, number>
  extraData?: Record<string, unknown>
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

export type GameState = {
  round: number
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
}

export type CanBeExecutedByPlayer = (
  state: GameState,
  player: PlayerState,
) => boolean

export type ActionExecutionContext = {
  state: GameState
  player: PlayerState
  space: ActionSpace
  costs?: Partial<Resource>
  params?: Partial<Resource>
  sourceCard?: string
}

export type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, string | number>
}

export type ActionExecutionResult =
  | { type: 'ok'; logKey?: string; resourcesGained?: Partial<Resource>; logParams?: Record<string, unknown> }
  | { type: 'choice'; promptKey?: string; options: ActionChoiceOption[] }
  | { type: 'animalReorg'; sourceId: string }
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow }
export type ActionFlow =
  | { type: 'leaf'; actionId: string; optional?: boolean; promptKey?: string; params?: Partial<Resource>; sourceCard?: string }
  | {
      type: 'seq' | 'or' | 'xor' | 'parallel'
      promptKey?: string
      children: ActionFlow[]
      optional?: boolean
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
  | { type: 'choice'; playerIndex: number; spaceId: string; options: ActionChoiceOption[]; promptKey?: string; costOverride?: Partial<Resource> }
  | { type: 'animalReorg'; playerIndex: number; spaceId: string }
  | { type: 'harvestFeed'; playerIndex: number; remaining: number; feedQueue?: { index: number; remaining: number }[] }
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
  labelParams?: Record<string, string | number>
  actionId?: string
  sourceCard?: string
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
      costPerRoom?: Partial<Resource>
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
      options: ActionChoiceOption[]
      costOverride?: Partial<Resource>
    })
  | (InteractionBase & {
      stateId: 'farmSelect'
      playerIndex: number
      spaceId: string
      promptKey?: string
      options: ActionChoiceOption[]
      costOverride?: Partial<Resource>
      farm: InteractionFarmSelection
    })
  | (InteractionBase & {
      stateId: 'animalReorg'
      playerIndex: number
      spaceId: string
    })
  | (InteractionBase & {
      stateId: 'harvestFeed'
      playerIndex: number
      remaining: number
      feedQueue?: { index: number; remaining: number }[]
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
