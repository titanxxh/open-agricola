import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import '../../shared/cards/C/C80_RockyTerrain'

const CARD_ID = 'C80_RockyTerrain'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [], playedCards: [`minor:${CARD_ID}`],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C80_RockyTerrain', () => {
  it('returns pay-gain flow after plow when player has food', () => {
    const listener = findListener('C80-rocky-terrain-after-plow')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.resources.food = 3
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as any).children
    expect(children[0].actionId).toBe('pay-resources')
    expect(children[0].params).toEqual({ food: 1 })
    expect(children[1].actionId).toBe('gain')
    expect(children[1].params).toEqual({ stone: 1 })
  })

  it('does not trigger when player has no food', () => {
    const listener = findListener('C80-rocky-terrain-after-plow')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.resources.food = 0
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger when card is not played', () => {
    const listener = findListener('C80-rocky-terrain-after-plow')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = []
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
  })
})
