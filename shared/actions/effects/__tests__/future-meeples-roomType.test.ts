import { describe, expect, it } from 'vitest'
import {
  queueFutureMeeples,
  resolveFutureMeepleRequests,
} from '../internal/future-meeples'
import { applyFutureMeeples } from '../../../session/state-constants'
import type { FarmTilePosition, GameState, PlayerState, Resource } from '../../../contract/types'

const emptyResources = (): Resource => ({
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
})

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: emptyResources(),
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  ...overrides,
})

const createState = (player: PlayerState, round = 1): GameState =>
  ({
    round,
    phase: 'playing',
    roundPhase: 'preparation',
    draft: null,
    currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [],
    log: [],
    roundActionOrder: Array(14).fill(null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    enableCommunityDeck: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

const queueRoomTypeRequest = (state: GameState, playerId: string) => {
  queueFutureMeeples(state, {
    cardId: 'B014_Hawktower',
    playerId,
    entries: [{ round: 12, roomType: 'stone' }],
  })
}

describe('future-meeples roomType resolution', () => {
  it('preserves roomType when resolveFutureMeepleRequests queues an entry', () => {
    const player = createPlayer({ houseType: 'stone' })
    const state = createState(player, 1)
    queueRoomTypeRequest(state, player.id)

    resolveFutureMeepleRequests(state)

    expect(state.pendingFutureMeeples).toHaveLength(0)
    expect(state.futureMeeples).toHaveLength(1)
    const entry = state.futureMeeples[0]!
    expect(entry.cardId).toBe('B014_Hawktower')
    expect(entry.round).toBe(12)
    expect(entry.roomType).toBe('stone')
  })

  it('adds a stone room when round matches and houseType=stone', () => {
    const player = createPlayer({ houseType: 'stone' })
    const state = createState(player, 1)
    queueRoomTypeRequest(state, player.id)
    resolveFutureMeepleRequests(state)

    state.round = 12
    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms + 1)
    expect(player.roomTiles.length).toBe(beforeTiles + 1)
    // entry consumed
    expect(
      state.futureMeeples.some(
        (e) => e.cardId === 'B014_Hawktower' && e.playerId === player.id,
      ),
    ).toBe(false)
  })

  it('silently skips when houseType=clay (mismatch)', () => {
    const player = createPlayer({ houseType: 'clay' })
    const state = createState(player, 1)
    queueRoomTypeRequest(state, player.id)
    resolveFutureMeepleRequests(state)

    state.round = 12
    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms)
    expect(player.roomTiles.length).toBe(beforeTiles)
    // entry still consumed (dropped)
    expect(
      state.futureMeeples.some(
        (e) => e.cardId === 'B014_Hawktower' && e.playerId === player.id,
      ),
    ).toBe(false)
  })

  it('does not add a room when houseType=stone but farmyard is full', () => {
    const allTiles: FarmTilePosition[] = []
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 5; c += 1) allTiles.push({ row: r, col: c })
    const roomTiles = [allTiles[0]!, allTiles[1]!]
    const fields = allTiles.slice(2).map((t) => ({
      row: t.row,
      col: t.col,
      stacks: [],
    }))
    const player = createPlayer({ houseType: 'stone', roomTiles, fields })
    const state = createState(player, 1)
    queueRoomTypeRequest(state, player.id)
    resolveFutureMeepleRequests(state)

    state.round = 12
    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms)
    expect(player.roomTiles.length).toBe(beforeTiles)
  })
})
