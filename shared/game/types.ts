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
}

export type ActionChoiceOption = {
  value: string
  labelKey: string
  labelParams?: Record<string, string | number>
}

export type ActionExecutionResult =
  | { type: 'ok'; logKey?: string }
  | { type: 'choice'; promptKey?: string; options: ActionChoiceOption[] }
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow }

export type ActionFlow =
  | { type: 'leaf'; actionId: string; optional?: boolean; promptKey?: string }
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
