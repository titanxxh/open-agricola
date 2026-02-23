import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../game/types'
import {
  ensureSingleStartPlayer,
  getNextPlayerIndex,
  getOpenedActionIds,
} from '../hooks/use-turn-flow'

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

const createPlayer = (id: string): PlayerState => ({
  id,
  name: id,
  color: 'red',
  resources: resources(),
  familySize: 2,
  workersAvailable: 2,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

const createState = (): GameState => ({
  round: 3,
  currentPlayerIndex: 1,
  players: [createPlayer('p1'), createPlayer('p2'), createPlayer('p3')],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [
    'sheep-market',
    'grain-utilization',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('use-turn-flow helpers', () => {
  it('switches current player index', () => {
    const state = createState()
    expect(getNextPlayerIndex(state)).toBe(2)
  })

  it('opens correct actions by round order', () => {
    const state = createState()
    expect(getOpenedActionIds(state)).toEqual(['sheep-market', 'grain-utilization'])
  })

  it('enforces unique start player', () => {
    const state = createState()
    ensureSingleStartPlayer(state, 'p2')
    expect(state.players.filter((player) => player.startPlayer)).toHaveLength(1)
    expect(state.players[1].startPlayer).toBe(true)
  })
})
