import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../../shared/game/types'
import { workersAvailable, newbornCount, familySize } from '../../../shared/game/player'
import {
  applyReturnHomePhase,
  canPerformRoundEnd,
  finalizeRoundCore,
  nextPlayerIndex,
  prepareRoundEndCore,
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

const player = (id: string, workersAtHome = 0): PlayerState => ({
  id,
  name: id,
  color: 'red',
  resources: resources(),
  // workers: N active, all at home (no takenBy in this test's default setup)
  workers: Array.from({ length: 5 }, (_, i) => ({
    id: String(i + 1),
    isActive: i < workersAtHome,
    isNewborn: false,
  })),
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
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
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
      takenBy: [{ playerId: 'p1', workerId: '1' }],
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
    // After return-home, action spaces are cleared so all active workers are at home
    expect(workersAvailable(next, next.players[0])).toBe(familySize(next.players[0]))
    expect(next.actionSpaces[0].takenBy).toEqual([])
  })

  it('finalizes to next round and sets current player by startPlayer', () => {
    const next = state()
    next.players[1].startPlayer = true
    const result = finalizeRoundCore(next)
    expect(result.type).toBe('nextRound')
    expect(next.round).toBe(2)
    expect(next.currentPlayerIndex).toBe(1)
    expect(newbornCount(next.players[0])).toBe(0)
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

  it('checks round-end guard conditions', () => {
    const current = state()
    expect(
      canPerformRoundEnd({
        state: current,
        allWorkersUsed: true,
        pendingNextPlayerIndex: null,
        hasPendingChoice: false,
        hasPendingAnimalReorg: false,
        hasPendingHarvestFeed: false,
      }),
    ).toBe(true)
    expect(
      canPerformRoundEnd({
        state: current,
        allWorkersUsed: false,
        pendingNextPlayerIndex: null,
        hasPendingChoice: false,
        hasPendingAnimalReorg: false,
        hasPendingHarvestFeed: false,
      }),
    ).toBe(false)
  })

  it('prepares pending-animals round-end branch', () => {
    const base = state()
    const plan = prepareRoundEndCore({
      baseState: base,
      hasPendingAnimals: (p) => p.id === 'p2',
      cloneState: (s) => ({ ...s, players: s.players.map((p) => ({ ...p })) }),
      harvestRounds: [4, 7, 9, 11, 13, 14],
    })
    expect(plan.type).toBe('pendingAnimals')
    if (plan.type === 'pendingAnimals') {
      expect(plan.pendingPlayerIndex).toBe(1)
    }
  })
})
