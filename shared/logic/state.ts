// Catalog-dependent state helpers (server-facing).
//
// For the client-safe slice (pure data, no catalog), see `./state-constants`.
// This module re-exports everything from `./state-constants` so existing
// server/test consumers can keep importing from `shared/logic/state`.

import {
  createDefaultRoomTiles,
  FARM_COLS,
  FARM_ROWS,
  getAllTilePositions,
  positionKey,
} from '../game/farm'
import { createRng, createSeed, shuffleWithRng } from './rng'
import { createActionSpaces } from '../actions'
import { majorImprovementIds } from '../game/major-improvements'
import { implementedMinorImprovementCards, implementedOccupationCards } from '../cards/catalog'
import type { ActionSpace, GameState, PlayerState } from '../game/types'
import { createPlayerActionSpaces } from '../cards/player-action-space'
import { normalizeTakenBy } from '../game/space'
import {
  applyRoundGrowth,
  defaultPlayerColors,
  defaultSandboxDeckIds,
  emptyResources,
  generateRoundActionOrder,
  normalizeFenceSegments,
  type DefaultSandboxDeckId,
  type InitialStateOptions,
} from './state-constants'

export * from './state-constants'

const normalizeDeckIds = (deckIds?: string[]): DefaultSandboxDeckId[] => {
  const next = deckIds
    ?.filter((deck): deck is string => typeof deck === 'string')
    .map((deck) => deck.trim().toUpperCase())
    .filter((deck): deck is DefaultSandboxDeckId =>
      (defaultSandboxDeckIds as readonly string[]).includes(deck),
    ) ?? []
  return next.length > 0 ? Array.from(new Set(next)) : [...defaultSandboxDeckIds]
}

export const dealHands = (
  playerCount: number,
  seed: number,
  extraMinorIds: string[] = [],
  extraOccupationIds: string[] = [],
  deckIds?: string[],
) => {
  const rng = createRng(seed)
  const allowedDecks = new Set<string>(normalizeDeckIds(deckIds))
  const minorPool = Array.from(new Set([
    ...implementedMinorImprovementCards
      .filter((card) => allowedDecks.has(card.deck))
      .map((card) => card.id),
    ...extraMinorIds,
  ]))
  const occupationPool = Array.from(new Set([
    ...implementedOccupationCards
      .filter((card) => allowedDecks.has(card.deck))
      .map((card) => card.id),
    ...extraOccupationIds,
  ]))
  const shuffledMinor = shuffleWithRng(minorPool, rng)
  const shuffledOccupation = shuffleWithRng(occupationPool, rng)
  const minorHands: string[][] = []
  const occupationHands: string[][] = []
  for (let index = 0; index < playerCount; index += 1) {
    minorHands.push(shuffledMinor.slice(index * 7, index * 7 + 7))
    occupationHands.push(shuffledOccupation.slice(index * 7, index * 7 + 7))
  }
  return { minorHands, occupationHands }
}

export const normalizeState = (raw: GameState): GameState => {
  const seed = raw.gameSeed ?? createSeed()
  const roundActionOrder =
    raw.roundActionOrder?.length === 14
      ? raw.roundActionOrder
      : generateRoundActionOrder(seed)
  const baseSpaces = createActionSpaces(raw.players?.length)
  const spaceMap = new Map(
    (raw.actionSpaces ?? []).map((space) => [space.id, space]),
  )
  const actionSpaces = baseSpaces.map((space) => {
    const stored = spaceMap.get(space.id)
    return {
      ...space,
      resources: stored?.resources ?? space.resources,
      takenBy: normalizeTakenBy(stored?.takenBy),
    }
  })
  // Append PlayerActionCard dynamic spaces
  const playerActionSpaces = createPlayerActionSpaces({ players: raw.players } as GameState)
  for (const pas of playerActionSpaces) {
    const stored = spaceMap.get(pas.id)
    if (stored) {
      pas.resources = stored.resources ?? pas.resources
      pas.takenBy = normalizeTakenBy(stored.takenBy)
    }
    actionSpaces.push(pas)
  }
  // Preserve caller-added spaces not produced by createActionSpaces / PlayerActionCard.
  // (e.g. `__test-worker-sink__` and `card-worker:...` pseudo-spaces.)
  const allBaseActionIds = new Set(createActionSpaces().map((space) => space.id))
  const knownIds = new Set(actionSpaces.map((s) => s.id))
  for (const stored of raw.actionSpaces ?? []) {
    if (knownIds.has(stored.id)) continue
    if (allBaseActionIds.has(stored.id)) continue
    actionSpaces.push({
      ...stored,
      takenBy: normalizeTakenBy(stored.takenBy),
    } as ActionSpace)
  }
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
    const extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
    const playedCards = player.playedCards ?? []
    const normalized = {
      ...player,
      color:
        player.color ?? defaultPlayerColors[index % defaultPlayerColors.length],
      houseType: player.houseType ?? 'wood',
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
      extraOccupationsFromCards: extraOccupationsFromCards.length > 0 ? extraOccupationsFromCards : [],
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
      workers: player.workers && player.workers.length > 0
        ? player.workers
        : [
            { id: '1', isActive: true,  isNewborn: false },
            { id: '2', isActive: true,  isNewborn: false },
            { id: '3', isActive: false, isNewborn: false },
            { id: '4', isActive: false, isNewborn: false },
            { id: '5', isActive: false, isNewborn: false },
          ],
      stableAnimals: player.stableAnimals ?? {},
      pastures: player.pastures ?? [],
      fenceSegments: normalizeFenceSegments(player.fenceSegments),
      roomTiles:
        player.roomTiles && player.roomTiles.length > 0
          ? [...player.roomTiles]
          : createDefaultRoomTiles(player.rooms ?? 2),
      stableTiles: player.stableTiles ?? [],
      majorEffects: player.majorEffects ?? { wellRounds: 0 },
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
    const migrateField = (field: any) => {
      if (field.stacks === undefined) {
        const legacyCrop = field.crop
        const legacyRemaining = field.remaining ?? 0
        field.stacks =
          legacyCrop && legacyRemaining > 0
            ? [{ kind: legacyCrop, remaining: legacyRemaining }]
            : []
        delete field.crop
        delete field.remaining
      }
      return field
    }
    const normalizedFields = (normalized.fields ?? []).flatMap((rawField) => {
      const field = migrateField(rawField as any)
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
    phase: raw.phase ?? 'work',
    futureMeeples: raw.futureMeeples ?? [],
    pendingFutureMeeples: raw.pendingFutureMeeples ?? [],
  }
}

export const cloneState = (state: GameState): GameState => {
  let raw: GameState
  if (typeof structuredClone === 'function') {
    try {
      raw = structuredClone(state)
    } catch {
      raw = JSON.parse(JSON.stringify(state)) as GameState
    }
  } else {
    raw = JSON.parse(JSON.stringify(state)) as GameState
  }
  return normalizeState(raw)
}

export const createInitialPlayers = (
  seed: number,
  options: InitialStateOptions = {},
): PlayerState[] => {
  const {
    playerCount = 2,
    extraMinorIds = [],
    extraOccupationIds = [],
    deckIds,
    playerNames = [],
  } = options
  const count = Math.max(1, Math.min(4, Math.floor(playerCount)))
  const dealtHands = dealHands(count, seed, extraMinorIds, extraOccupationIds, deckIds)
  const base: Array<{
    id: PlayerState['id']
    name: string
    color: PlayerState['color']
    startPlayer: boolean
  }> = [
    { id: 'p1', name: 'PlayerA', color: 'red', startPlayer: true },
    { id: 'p2', name: 'PlayerB', color: 'blue', startPlayer: false },
    { id: 'p3', name: 'PlayerC', color: 'black', startPlayer: false },
    { id: 'p4', name: 'PlayerD', color: 'yellow', startPlayer: false },
  ]
  return base.slice(0, count).map((info, index) => {
    const player: PlayerState = {
      id: info.id,
      name: playerNames[index] ?? info.name,
      color: info.color,
      resources: { ...emptyResources, food: 2 },
      workers: [
        { id: '1', isActive: true,  isNewborn: false },
        { id: '2', isActive: true,  isNewborn: false },
        { id: '3', isActive: false, isNewborn: false },
        { id: '4', isActive: false, isNewborn: false },
        { id: '5', isActive: false, isNewborn: false },
      ],
      rooms: 2,
      houseType: 'wood',
      fields: [],
      roomTiles: createDefaultRoomTiles(2),
      stableTiles: [],
      improvements: [],
      minorHand: dealtHands.minorHands[index] ?? [],
      minorPlayed: [],
      occupationHand: dealtHands.occupationHands[index] ?? [],
      occupationPlayed: [],
      extraOccupationsFromCards: [],
      playedCards: [],
      houseAnimalType: null,
      houseAnimalCount: 0,
      stableAnimals: {},
      pastures: [],
      fenceSegments: [],
      majorEffects: { wellRounds: 0 },
      startPlayer: info.startPlayer,
      activeModifiers: [],
      cardStates: {},
    }
    return player
  })
}

export const createRoundSnapshot = (state: GameState): GameState => {
  const snapshot = cloneState(state)
  snapshot.roundStartSnapshot = null
  return snapshot
}

export const createInitialState = (
  seed?: number,
  extraMinorIdsOrOptions: string[] | InitialStateOptions = [],
  extraOccupationIds: string[] = [],
): GameState => {
  const options: InitialStateOptions = Array.isArray(extraMinorIdsOrOptions)
    ? { extraMinorIds: extraMinorIdsOrOptions, extraOccupationIds }
    : extraMinorIdsOrOptions
  const gameSeed =
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.floor(seed)
      : createSeed()
  const roundActionOrder = generateRoundActionOrder(gameSeed)
  const initialState: GameState = {
    round: 1,
    phase: 'work',
    currentPlayerIndex: 0,
    players: createInitialPlayers(gameSeed, options),
    actionSpaces: createActionSpaces(options.playerCount ?? 2),
    log: [{ key: 'log.startGame' }],
    roundStartSnapshot: null,
    roundActionOrder,
    gameSeed,
    availableMajorImprovements: [...majorImprovementIds],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }
  applyRoundGrowth(initialState)
  initialState.roundStartSnapshot = createRoundSnapshot(initialState)
  return initialState
}
