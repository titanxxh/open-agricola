import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../B/B15_CarpentersBench'

const CARD_ID = 'B15_CarpentersBench'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('B15_CarpentersBench', () => {
  it('triggers after collecting from a wood accumulation space', () => {
    const listener = findListener('B15-carpenters-bench-after-collect')
    expect(listener).toBeDefined()
    const player = createPlayer()
    const state = createState(player)
    const woodSpace = createSpace('forest', { gainPerRound: { wood: 3 } })

    const result = executeCardListener(listener!, {
      state,
      player,
      space: woodSpace,
      actionId: 'collect',
      phase: 'after',
    })
    expect(result).toBeDefined()
    const flow = (result as any).flow
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children[0].actionId).toBe('fence')
    expect(flow.children[0].sourceCard).toBe(CARD_ID)
  })

  it('does not trigger for non-wood accumulation spaces', () => {
    const listener = findListener('B15-carpenters-bench-after-collect')
    const player = createPlayer()
    const state = createState(player)
    const claySpace = createSpace('clay-pit', { gainPerRound: { clay: 1 } })

    const result = executeCardListener(listener!, {
      state,
      player,
      space: claySpace,
      actionId: 'collect',
      phase: 'after',
    })
    expect(result).toBeUndefined()
  })

})
