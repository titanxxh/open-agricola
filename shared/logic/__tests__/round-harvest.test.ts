import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../game/types'
import { performHarvest } from '../round'

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

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: emptyResources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2,
  houseType: 'wood',
  fields: [{ row: 1, col: 1, crop: 'grain', remaining: 1 }],
  roomTiles: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ],
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
  pastures: [
    {
      id: 'pasture-1',
      size: 1,
      tiles: [{ row: 2, col: 0 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    },
  ],
  fenceSegments: [
    { edge: 'h:2:0', type: 'fence' },
    { edge: 'h:3:0', type: 'fence' },
    { edge: 'v:2:0', type: 'fence' },
    { edge: 'v:2:1', type: 'fence' },
  ],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

const createState = (player: PlayerState): GameState => ({
  round: 4,
  currentPlayerIndex: 0,
  players: [player],
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

describe('performHarvest', () => {
  it('runs reap then feed then breed and reports summary', () => {
    const player = createPlayer()
    player.resources.food = 2
    player.resources.sheep = 2
    const state = createState(player)

    const summary = performHarvest(state)

    // reap
    expect(summary.reap).toEqual(
      expect.arrayContaining([expect.objectContaining({ grain: 1 })]),
    )
    // feed: familySize=2 => 4 food needed, had 2 food + 1 grain (from reap) => 1 begging
    expect(summary.feed).toEqual(
      expect.arrayContaining([expect.objectContaining({ begging: 1 })]),
    )
    // breed: sheep at least 2 and has capacity
    expect(summary.breed).toEqual(
      expect.arrayContaining([expect.objectContaining({ sheep: 1 })]),
    )
    expect(player.resources.sheep).toBe(3)
  })

  it('applies major onHarvest effects after harvest pipeline', () => {
    const player = createPlayer()
    player.improvements = ['Major_Joinery']
    player.resources.wood = 1
    player.resources.food = 0
    const state = createState(player)

    performHarvest(state)

    expect(player.resources.wood).toBe(0)
    expect(player.resources.food).toBe(2)
  })
})
