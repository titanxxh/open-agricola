import { describe, expect, it, vi } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'
import {
  getPlayerActionSpaceConfig,
  createPlayerActionSpaces,
} from '../player-action-space'

// Import cards to register effects
import '../D/D51_Archway'
import '../E/E10_StrawHat'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
    ...overrides,
  }) as ActionSpace

const createState = (players: PlayerState[], spaces: ActionSpace[] = []): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: spaces, log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

describe('PlayerActionSpace infrastructure', () => {
  it('D51 is registered with access=all', () => {
    const config = getPlayerActionSpaceConfig('D51_Archway')
    expect(config).toBeDefined()
    expect(config!.access).toBe('all')
  })

  it('createPlayerActionSpaces creates space when card is in minorPlayed', () => {
    const player = createPlayer()
    player.minorPlayed = ['D51_Archway']
    const state = createState([player])
    const spaces = createPlayerActionSpaces(state)
    expect(spaces.length).toBe(1)
    expect(spaces[0].id).toBe('D51_Archway')
  })

  it('createPlayerActionSpaces does not duplicate', () => {
    const p1 = createPlayer('p1')
    p1.minorPlayed = ['D51_Archway']
    const p2 = createPlayer('p2')
    p2.minorPlayed = ['D51_Archway']
    const spaces = createPlayerActionSpaces(createState([p1, p2]))
    expect(spaces.filter((s) => s.id === 'D51_Archway').length).toBe(1)
  })

  it('createPlayerActionSpaces ignores non-registered cards', () => {
    const player = createPlayer()
    player.minorPlayed = ['A55_JunkRoom']
    const spaces = createPlayerActionSpaces(createState([player]))
    expect(spaces.length).toBe(0)
  })
})
