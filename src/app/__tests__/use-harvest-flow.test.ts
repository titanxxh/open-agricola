import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../../shared/game/types'
import { canFinalizeHarvest, runHarvestFlow } from '../hooks/use-harvest-flow'

const resources = (): Resource => ({
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

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resources(),
  familySize: 2,
  workersAvailable: 2,
  rooms: 2,
  houseType: 'wood',
  fields: [{ row: 1, col: 1, crop: 'grain', remaining: 1 }],
  fences: 4,
  roomTiles: [],
  stableTiles: [{ row: 2, col: 2 }],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: { '2-2': 'boar' },
  newbornCount: 0,
  pastures: [
    {
      id: 'p',
      size: 1,
      tiles: [{ row: 2, col: 0 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    },
  ],
  fenceSegments: ['h:2:0', 'h:3:0', 'v:2:0', 'v:2:1'],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

const createState = (): GameState => ({
  round: 4,
  currentPlayerIndex: 0,
  players: [createPlayer()],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('use-harvest-flow helpers', () => {
  it('runs reap/feed/breed sequence through round logic', () => {
    const state = createState()
    const summary = runHarvestFlow(state)
    expect(summary.reap[0]?.grain).toBe(1)
    expect(summary.feed[0]?.begging).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(summary.breed)).toBe(true)
  })

  it('blocks finalize when feed still pending', () => {
    expect(canFinalizeHarvest({ p1: 1, p2: 0 })).toBe(false)
    expect(canFinalizeHarvest({ p1: 0 })).toBe(true)
  })

  it('applies major onHarvest effects on finalize', () => {
    const state = createState()
    state.players[0].improvements = ['Major_Joinery']
    state.players[0].resources.wood = 1

    runHarvestFlow(state)

    expect(state.players[0].resources.wood).toBe(0)
    expect(state.players[0].resources.food).toBeGreaterThanOrEqual(2)
  })
})
