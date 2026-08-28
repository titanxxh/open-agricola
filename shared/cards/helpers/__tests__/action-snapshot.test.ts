import { describe, it, expect } from 'vitest'
import {
  beginTurnScope,
  endTurnScope,
  recordActionSnapshot,
  readActionSnapshotToken,
  getRoomsBuiltThisAction,
  getStableTilesBuiltThisAction,
  getFencesBuiltThisAction,
} from '../action-snapshot'
import type { PlayerState } from '../../../contract/types'

const makePlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  resources: { food: 0, grain: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0, sheep: 0, boar: 0, cattle: 0 },
  workers: [],
  pastures: [],
  fields: [],
  fenceSegments: [],
  stableTiles: [],
  roomTiles: [],
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
  majorEffects: {},
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: {},
} as unknown as PlayerState)

describe('action-snapshot', () => {
  it('recordActionSnapshot writes token + tile counts + fence segments', () => {
    const player = makePlayer()
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }] as PlayerState['roomTiles']
    player.stableTiles = [{ row: 1, col: 0 }] as PlayerState['stableTiles']
    player.fenceSegments = [
      { edge: '0,0/N', type: 'fence' },
      { edge: '0,0/E', type: 'fence' },
      { edge: '0,0/S', type: 'fence' },
    ]

    recordActionSnapshot(player, 7)

    expect(readActionSnapshotToken(player)).toBe(7)
    expect(player.cardStates['__actionSnapshot__']!.extraData).toMatchObject({
      token: 7,
      stableTiles: 1,
      roomTiles: 2,
      fenceSegments: 3,
    })
  })

  it('getRoomsBuiltThisAction returns delta after recordActionSnapshot', () => {
    const player = makePlayer()
    player.roomTiles = [{ row: 0, col: 0 }] as PlayerState['roomTiles']
    recordActionSnapshot(player, 1)
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ] as PlayerState['roomTiles']
    expect(getRoomsBuiltThisAction(player)).toBe(2)
  })

  it('getStableTilesBuiltThisAction returns delta', () => {
    const player = makePlayer()
    player.stableTiles = []
    recordActionSnapshot(player, 1)
    player.stableTiles = [{ row: 0, col: 0 }] as PlayerState['stableTiles']
    expect(getStableTilesBuiltThisAction(player)).toBe(1)
  })

  it('getFencesBuiltThisAction returns delta', () => {
    const player = makePlayer()
    player.fenceSegments = []
    recordActionSnapshot(player, 1)
    player.fenceSegments = [
      { edge: '0,0/N', type: 'fence' },
      { edge: '0,0/E', type: 'fence' },
      { edge: '0,0/S', type: 'fence' },
      { edge: '0,0/W', type: 'fence' },
    ]
    expect(getFencesBuiltThisAction(player)).toBe(4)
  })

  it('getFencesBuiltThisAction returns 0 when no snapshot recorded', () => {
    const player = makePlayer()
    player.fenceSegments = [{ edge: '0,0/N', type: 'fence' }]
    expect(getFencesBuiltThisAction(player)).toBe(0)
  })

  it('getFencesBuiltThisAction never returns negative', () => {
    const player = makePlayer()
    player.fenceSegments = [
      { edge: '0,0/N', type: 'fence' },
      { edge: '0,0/E', type: 'fence' },
    ]
    recordActionSnapshot(player, 1)
    player.fenceSegments = []
    expect(getFencesBuiltThisAction(player)).toBe(0)
  })

  it('keeps turn tokens monotonic after a scope ends', () => {
    const player = makePlayer()
    expect(recordActionSnapshot(player, 7)).toBe(7)
    endTurnScope(player)
    expect(readActionSnapshotToken(player)).toBeUndefined()
    expect(beginTurnScope(player)).toBe(8)
    endTurnScope(player)
    expect(recordActionSnapshot(player, 1)).toBe(9)
  })
})
