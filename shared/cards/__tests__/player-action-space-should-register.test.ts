import { describe, expect, it, beforeEach } from 'vitest'
import {
  createPlayerActionSpaces,
  getPlayerActionSpaceConfig,
  registerPlayerActionSpace,
} from '../player-action-space'
import type { GameState, PlayerState, Resource } from '../../game/types'

const TEST_CARD = '__TEST_PA_GATED__'

const emptyResources: Resource = {
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
}

const createPlayer = (id: string, played: string[]): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: { ...emptyResources },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood', fields: [],
    roomTiles: [], stableTiles: [], improvements: [],
    minorHand: [], minorPlayed: played, occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createState = (players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

describe('PlayerActionSpaceConfig.shouldRegister', () => {
  beforeEach(() => {
    if (!getPlayerActionSpaceConfig(TEST_CARD)) {
      registerPlayerActionSpace({
        cardId: TEST_CARD,
        access: 'all',
        shouldRegister: (state) => state.players.length < 4,
        createDefinition: () => ({
          id: TEST_CARD,
          nameKey: 'test.name',
          descriptionKey: 'test.desc',
          canBeExecutedByPlayer: () => true,
          execute: () => ({ type: 'ok' }),
        }),
      })
    }
  })

  it('registers the space when shouldRegister returns true', () => {
    const state = createState([createPlayer('p1', [TEST_CARD])])
    const spaces = createPlayerActionSpaces(state)
    expect(spaces.find((s) => s.id === TEST_CARD)).toBeDefined()
  })

  it('skips the space when shouldRegister returns false', () => {
    const state = createState([
      createPlayer('p1', [TEST_CARD]),
      createPlayer('p2', []),
      createPlayer('p3', []),
      createPlayer('p4', []),
    ])
    const spaces = createPlayerActionSpaces(state)
    expect(spaces.find((s) => s.id === TEST_CARD)).toBeUndefined()
  })
})
