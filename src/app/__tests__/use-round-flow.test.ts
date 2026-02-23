import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../game/types'
import {
  applyReturnHomePhase,
  finalizeRoundCore,
  nextPlayerIndex,
} from '../hooks/use-round-flow'

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

const player = (id: string, workers = 0): PlayerState => ({
  id,
  name: id,
  color: 'red',
  resources: resources(),
  familySize: 2,
  workersAvailable: workers,
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
  newbornCount: 1,
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

const state = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [player('p1', 0), player('p2', 1)],
  actionSpaces: [
    {
      id: 'forest',
      nameKey: 'actions.forest.name',
      descriptionKey: 'actions.forest.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
      resources: resources(),
      takenBy: 'p1',
    },
  ],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('use-round-flow helpers', () => {
  it('applies return-home phase', () => {
    const next = state()
    applyReturnHomePhase(next)
    expect(next.players[0].workersAvailable).toBe(next.players[0].familySize)
    expect(next.actionSpaces[0].takenBy).toBeNull()
  })

  it('finalizes to next round and sets current player by startPlayer', () => {
    const next = state()
    next.players[1].startPlayer = true
    const result = finalizeRoundCore(next)
    expect(result.type).toBe('nextRound')
    expect(next.round).toBe(2)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.players[0].newbornCount).toBe(0)
  })

  it('returns gameOver when round passes 14', () => {
    const next = state()
    next.round = 14
    const result = finalizeRoundCore(next)
    expect(result.type).toBe('gameOver')
    expect(next.gameOver).toBe(true)
  })

  it('finds next player index with available worker', () => {
    const players = [player('p1', 0), player('p2', 0), player('p3', 1)]
    expect(nextPlayerIndex(players, 0)).toBe(2)
  })
})
