import {
  createDefaultRoomTiles,
  FARM_COLS,
  FARM_ROWS,
  getAllTilePositions,
  positionKey,
} from '../game/farm'
import { createActionSpaces } from '../actions'
import { majorImprovementIds } from '../game/major-improvements'
import { minorImprovementIds } from '../game/minor-improvements'
import { occupationIds } from '../game/occupations'
import type { ActionSpace, GameState, PlayerState, Resource } from '../game/types'

export const emptyResources: Resource = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

export const resourceKeyList: (keyof Resource)[] = [
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
]

export const roundStageSlots = [
  { stage: 1, count: 4 },
  { stage: 2, count: 3 },
  { stage: 3, count: 2 },
  { stage: 4, count: 2 },
  { stage: 5, count: 2 },
  { stage: 6, count: 1 },
]

export const roundStageActions: Record<number, string[]> = {
  1: ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement'],
  2: ['wish-children', 'western-quarry', 'house-redevelopment'],
  3: ['vegetable-seeds', 'pig-market'],
  4: ['eastern-quarry', 'cattle-market'],
  5: ['cultivation', 'urgent-wish-children'],
  6: ['farm-redevelopment'],
}

export const baseActionOrder = [
  'forest',
  'copse',
  'grove',
  'clay-pit',
  'hollow-4',
  'reed-bank',
  'fishing',
  'traveling-players',
  'day-laborer',
  'meeting-place',
  'lessons',
  'lessons-4',
  'farmland',
  'grain-seeds',
  'farm-expansion',
  'resource-market-4',
]

export const createSeed = () => Math.floor(Math.random() * 1_000_000_000)

export const createRng = (seed: number) => {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let result = Math.imul(value ^ (value >>> 15), value | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

export const shuffleWithRng = (values: string[], rng: () => number) => {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const temp = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temp
  }
  return result
}

export const dealHands = (playerCount: number, seed: number) => {
  const rng = createRng(seed)
  const shuffledMinor = shuffleWithRng(minorImprovementIds, rng)
  const shuffledOccupation = shuffleWithRng(occupationIds, rng)
  const minorHands: string[][] = []
  const occupationHands: string[][] = []
  for (let index = 0; index < playerCount; index += 1) {
    minorHands.push(shuffledMinor.slice(index * 7, index * 7 + 7))
    occupationHands.push(shuffledOccupation.slice(index * 7, index * 7 + 7))
  }
  return { minorHands, occupationHands }
}

export const generateRoundActionOrder = (seed: number) => {
  const rng = createRng(seed)
  const order: (string | null)[] = []
  roundStageSlots.forEach(({ stage, count }) => {
    const pool = roundStageActions[stage] ?? []
    const shuffled = shuffleWithRng(pool, rng)
    for (let index = 0; index < count; index += 1) {
      order.push(shuffled[index] ?? null)
    }
  })
  return order
}

export const createRoundOpenById = (order: (string | null)[]) =>
  new Map(
    order
      .map((id, index) => (id ? [id, index + 1] : null))
      .filter((item): item is [string, number] => item !== null),
  )

export const isActionForPlayerCount = (
  space: ActionSpace,
  playerCount: number,
) => !space.players || space.players.includes(playerCount)

export const defaultPlayerColors: PlayerState['color'][] = [
  'red',
  'yellow',
  'blue',
  'black',
]

export const normalizeState = (raw: GameState): GameState => {
  const seed = raw.gameSeed ?? createSeed()
  const roundActionOrder =
    raw.roundActionOrder?.length === 14
      ? raw.roundActionOrder
      : generateRoundActionOrder(seed)
  const baseSpaces = createActionSpaces()
  const spaceMap = new Map(
    (raw.actionSpaces ?? []).map((space) => [space.id, space]),
  )
  const actionSpaces = baseSpaces.map((space) => {
    const stored = spaceMap.get(space.id)
    return {
      ...space,
      resources: stored?.resources ?? space.resources,
      takenBy: stored?.takenBy ?? null,
    }
  })
  const needsHands = raw.players.some(
    (player) =>
      (player.minorHand?.length ?? 0) === 0 ||
      (player.occupationHand?.length ?? 0) === 0,
  )
  const dealtHands = needsHands ? dealHands(raw.players.length, seed) : null
  const players = raw.players.map((player, index) => {
    const improvements = player.improvements ?? []
    const minorHand = player.minorHand ?? []
    const minorPlayed = player.minorPlayed ?? []
    const occupationHand = player.occupationHand ?? []
    const occupationPlayed = player.occupationPlayed ?? []
    const playedCards = player.playedCards ?? []
    const normalized = {
      ...player,
      color:
        player.color ?? defaultPlayerColors[index % defaultPlayerColors.length],
      houseType: player.houseType ?? 'wood',
      fences: player.fences ?? 0,
      improvements: improvements.length > 0 ? improvements : [],
      minorHand:
        minorHand.length > 0
          ? minorHand
          : dealtHands?.minorHands[index] ?? [],
      minorPlayed: minorPlayed.length > 0 ? minorPlayed : [],
      occupationHand:
        occupationHand.length > 0
          ? occupationHand
          : dealtHands?.occupationHands[index] ?? [],
      occupationPlayed: occupationPlayed.length > 0 ? occupationPlayed : [],
      playedCards:
        playedCards.length > 0
          ? playedCards
          : [
              ...improvements.map((id) => `major:${id}`),
              ...minorPlayed.map((id) => `minor:${id}`),
              ...occupationPlayed.map((id) => `occupation:${id}`),
            ],
      houseAnimalType: player.houseAnimalType ?? null,
      houseAnimalCount: player.houseAnimalCount ?? 0,
      stableAnimals: player.stableAnimals ?? {},
      newbornCount: player.newbornCount ?? 0,
      pastures: player.pastures ?? [],
      fenceSegments: player.fenceSegments ?? [],
      roomTiles:
        player.roomTiles && player.roomTiles.length > 0
          ? [...player.roomTiles]
          : createDefaultRoomTiles(player.rooms ?? 2),
      stableTiles: player.stableTiles ?? [],
      majorEffects: player.majorEffects ?? { wellRounds: 0, pendingBake: false },
    }
    const desiredRooms = normalized.rooms ?? normalized.roomTiles.length
    if (normalized.roomTiles.length < desiredRooms) {
      const used = new Set(normalized.roomTiles.map((tile) => positionKey(tile)))
      getAllTilePositions().forEach((pos) => {
        if (normalized.roomTiles.length >= desiredRooms) return
        const key = positionKey(pos)
        if (used.has(key)) return
        normalized.roomTiles.push(pos)
        used.add(key)
      })
    }
    if (normalized.roomTiles.length > desiredRooms) {
      normalized.roomTiles = normalized.roomTiles.slice(0, desiredRooms)
    }
    const used = new Set(normalized.roomTiles.map((tile) => positionKey(tile)))
    const allPositions = getAllTilePositions()
    const nextEmpty = () =>
      allPositions.find((pos) => !used.has(positionKey(pos)))
    const normalizedStableTiles = (normalized.stableTiles ?? []).filter(
      (tile) => {
        const key = positionKey(tile)
        if (used.has(key)) {
          return false
        }
        used.add(key)
        return true
      },
    )
    normalized.stableTiles = normalizedStableTiles
    const normalizedFields = (normalized.fields ?? []).flatMap((field) => {
      const row = Number.isFinite(field.row) ? field.row : -1
      const col = Number.isFinite(field.col) ? field.col : -1
      const validRow = row >= 0 && row < FARM_ROWS
      const validCol = col >= 0 && col < FARM_COLS
      const key = `${row}-${col}`
      if (validRow && validCol && !used.has(key)) {
        used.add(key)
        return [{ ...field, row, col }]
      }
      const next = nextEmpty()
      if (!next) {
        return []
      }
      used.add(positionKey(next))
      return [{ ...field, row: next.row, col: next.col }]
    })
    normalized.fields = normalizedFields
    const stableSet = new Set(
      normalized.stableTiles.map((tile) => positionKey(tile)),
    )
    normalized.pastures = (normalized.pastures ?? []).map((pasture, index) => {
      const tiles = pasture.tiles ?? []
      return {
        ...pasture,
        id: pasture.id ?? `pasture-${index + 1}`,
        tiles,
        stables: tiles.filter((tile) => stableSet.has(positionKey(tile)))
          .length,
      }
    })
    const pastureTileKeys = new Set(
      normalized.pastures.flatMap((pasture) =>
        (pasture.tiles ?? []).map((tile) => positionKey(tile)),
      ),
    )
    const looseStableKeys = new Set(
      normalized.stableTiles
        .map((tile) => positionKey(tile))
        .filter((key) => !pastureTileKeys.has(key)),
    )
    normalized.stableAnimals = Object.fromEntries(
      Object.entries(normalized.stableAnimals ?? {}).filter(([key]) =>
        looseStableKeys.has(key),
      ),
    )
    if (!normalized.houseAnimalType || normalized.houseAnimalCount <= 0) {
      normalized.houseAnimalType = null
      normalized.houseAnimalCount = 0
    } else {
      normalized.houseAnimalCount = Math.min(1, normalized.houseAnimalCount)
    }
    if (!Number.isFinite(normalized.newbornCount) || normalized.newbornCount < 0) {
      normalized.newbornCount = 0
    } else {
      normalized.newbornCount = Math.floor(normalized.newbornCount)
    }
    const expectedPlayedCards = [
      ...normalized.improvements.map((id) => `major:${id}`),
      ...normalized.minorPlayed.map((id) => `minor:${id}`),
      ...normalized.occupationPlayed.map((id) => `occupation:${id}`),
    ]
    const existingSet = new Set(normalized.playedCards ?? [])
    const missingCards = expectedPlayedCards.filter((id) => !existingSet.has(id))
    normalized.playedCards = [...(normalized.playedCards ?? []), ...missingCards]
    return normalized
  })
  const takenImprovements = new Set(
    players.flatMap((player) => player.improvements),
  )
  const availableMajorImprovements = (
    raw.availableMajorImprovements?.length
      ? raw.availableMajorImprovements
      : [...majorImprovementIds]
  ).filter(
    (id) => majorImprovementIds.includes(id) && !takenImprovements.has(id),
  )
  return {
    ...raw,
    players,
    actionSpaces,
    gameSeed: seed,
    roundActionOrder,
    availableMajorImprovements,
  }
}

export const cloneState = (state: GameState): GameState => {
  const raw = JSON.parse(JSON.stringify(state)) as GameState
  return normalizeState(raw)
}

export const createInitialPlayers = (seed: number): PlayerState[] => {
  const dealtHands = dealHands(4, seed)
  return [
    {
      id: 'p1',
      name: '玩家 A',
      color: 'red',
    resources: { ...emptyResources, food: 2 },
    familySize: 2,
    workersAvailable: 2,
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: createDefaultRoomTiles(2),
    stableTiles: [],
    improvements: [],
    minorHand: dealtHands.minorHands[0] ?? [],
    minorPlayed: [],
    occupationHand: dealtHands.occupationHands[0] ?? [],
    occupationPlayed: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    newbornCount: 0,
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0, pendingBake: false },
    startPlayer: true,
  },
    {
      id: 'p2',
      name: '玩家 B',
      color: 'blue',
    resources: { ...emptyResources, food: 2 },
    familySize: 2,
    workersAvailable: 2,
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: createDefaultRoomTiles(2),
    stableTiles: [],
    improvements: [],
    minorHand: dealtHands.minorHands[1] ?? [],
    minorPlayed: [],
    occupationHand: dealtHands.occupationHands[1] ?? [],
    occupationPlayed: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    newbornCount: 0,
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0, pendingBake: false },
    startPlayer: false,
  },
    {
      id: 'p3',
      name: '玩家 C',
      color: 'black',
    resources: { ...emptyResources, food: 2 },
    familySize: 2,
    workersAvailable: 2,
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: createDefaultRoomTiles(2),
    stableTiles: [],
    improvements: [],
    minorHand: dealtHands.minorHands[2] ?? [],
    minorPlayed: [],
    occupationHand: dealtHands.occupationHands[2] ?? [],
    occupationPlayed: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    newbornCount: 0,
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0, pendingBake: false },
    startPlayer: false,
  },
    {
      id: 'p4',
      name: '玩家 D',
      color: 'yellow',
    resources: { ...emptyResources, food: 2 },
    familySize: 2,
    workersAvailable: 2,
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: createDefaultRoomTiles(2),
    stableTiles: [],
    improvements: [],
    minorHand: dealtHands.minorHands[3] ?? [],
    minorPlayed: [],
    occupationHand: dealtHands.occupationHands[3] ?? [],
    occupationPlayed: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    newbornCount: 0,
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0, pendingBake: false },
    startPlayer: false,
    },
  ]
}

export const createRoundSnapshot = (state: GameState): GameState => {
  const snapshot = cloneState(state)
  snapshot.roundStartSnapshot = null
  return snapshot
}

export const applyRoundGrowth = (state: GameState) => {
  const roundOpenById = createRoundOpenById(state.roundActionOrder)
  state.actionSpaces.forEach((space) => {
    if (!isActionForPlayerCount(space, state.players.length)) return
    const openRound = roundOpenById.get(space.id) ?? space.roundAvailable
    if (state.round >= openRound) {
      Object.entries(space.gainPerRound).forEach(([key, value]) => {
        const amount = value ?? 0
        space.resources[key as keyof Resource] += amount
      })
    }
  })
}

export const harvestRounds = [4, 7, 9, 11, 13, 14]

export const createInitialState = (seed?: number): GameState => {
  const gameSeed =
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.floor(seed)
      : createSeed()
  const roundActionOrder = generateRoundActionOrder(gameSeed)
  const initialState: GameState = {
    round: 1,
    currentPlayerIndex: 0,
    players: createInitialPlayers(gameSeed),
    actionSpaces: createActionSpaces(),
    log: [{ key: 'log.startGame' }],
    roundStartSnapshot: null,
    roundActionOrder,
    gameSeed,
    availableMajorImprovements: [...majorImprovementIds],
    gameOver: false,
  }
  applyRoundGrowth(initialState)
  initialState.roundStartSnapshot = createRoundSnapshot(initialState)
  return initialState
}
