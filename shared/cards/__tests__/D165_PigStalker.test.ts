import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../game/types'

import '../D/D165_PigStalker'

const CARD_ID = 'D165_PigStalker'

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
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
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

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('D165_PigStalker', () => {
  it('grants 1 boar when player occupies adjacent round space', () => {
    const player = createPlayer()
    // Sheep-market at position 1, adjacent is position 2
    const roundActionOrder = [
      'sheep-market', 'grain-utilization', 'fencing', 'major-improvement',
      null, null, null, null, null, null, null, null, null, null,
    ]
    const state: GameState = {
      round: 4, roundPhase: 'work', currentPlayerIndex: 0,
      players: [player],
      actionSpaces: [
        createSpace('sheep-market', { takenBy: [{ playerId: 'p1', workerId: '1' }] }),
        createSpace('grain-utilization', { takenBy: [{ playerId: 'p1', workerId: '1' }] }), // adjacent to sheep-market
        createSpace('fencing', { takenBy: [] }),
        createSpace('major-improvement', { takenBy: [] }),
      ],
      log: [], roundStartSnapshot: null,
      roundActionOrder,
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as unknown as GameState

    const listener = findListener('D165-pig-stalker-after-place-farmer')
    expect(listener).toBeDefined()
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('sheep-market'),
      actionId: 'place-farmer',
      phase: 'after',
    })
    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(flow.actionId).toBe('gain')
    expect(flow.params.boar).toBe(1)
  })

  it('does not grant boar when no adjacent space is occupied by player', () => {
    const player = createPlayer()
    const roundActionOrder = [
      'sheep-market', 'grain-utilization', 'fencing', 'major-improvement',
      null, null, null, null, null, null, null, null, null, null,
    ]
    const state: GameState = {
      round: 4, roundPhase: 'work', currentPlayerIndex: 0,
      players: [player],
      actionSpaces: [
        createSpace('sheep-market', { takenBy: [{ playerId: 'p1', workerId: '1' }] }),
        createSpace('grain-utilization', { takenBy: [] }), // adjacent but unoccupied
        createSpace('fencing', { takenBy: [] }),
        createSpace('major-improvement', { takenBy: [] }),
      ],
      log: [], roundStartSnapshot: null,
      roundActionOrder,
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as unknown as GameState

    const listener = findListener('D165-pig-stalker-after-place-farmer')
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('sheep-market'),
      actionId: 'place-farmer',
      phase: 'after',
    })
    expect(result).toBeUndefined()
  })

  it('does not trigger for non-animal-market spaces', () => {
    const player = createPlayer()
    const state: GameState = {
      round: 4, roundPhase: 'work', currentPlayerIndex: 0,
      players: [player],
      actionSpaces: [],
      log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as unknown as GameState

    const listener = findListener('D165-pig-stalker-after-place-farmer')
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('day-laborer'),
      actionId: 'place-farmer',
      phase: 'after',
    })
    expect(result).toBeUndefined()
  })
})
