import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../contract/types'

import '../E/E77_Mattock'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'E77_Mattock'

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
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('E77_Mattock', () => {
  it('gains 1 clay after collecting from reed-bank', () => {
    const listener = findListener('E77-mattock-after-collect')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const space = createSpace('reed-bank', { gainPerRound: { reed: 1 } })
    const result = executeCardListener(listener, {
      state: createState(player), player, space,
      actionId: 'collect', phase: 'after',
      result: { type: 'ok', resourcesGained: { reed: 2 } },
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ clay: 1 })
  })

  it('gains 1 clay after collecting from eastern-quarry (stone)', () => {
    const listener = findListener('E77-mattock-after-collect')!
    const player = createPlayer()
    const space = createSpace('eastern-quarry', { gainPerRound: { stone: 1 } })
    const result = executeCardListener(listener, {
      state: createState(player), player, space,
      actionId: 'collect', phase: 'after',
      result: { type: 'ok', resourcesGained: { stone: 2 } },
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ clay: 1 })
  })

  it('gains 1 clay from resource-market-4 via place-farmer', () => {
    const listener = findListener('E77-mattock-place-farmer')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('resource-market-4'),
      actionId: 'place-farmer', phase: 'during',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ clay: 1 })
  })

  it('does not trigger for non-reed/stone accumulation', () => {
    const listener = findListener('E77-mattock-after-collect')!
    const player = createPlayer()
    const space = createSpace('clay-pit', { gainPerRound: { clay: 1 } })
    const result = executeCardListener(listener, {
      state: createState(player), player, space,
      actionId: 'collect', phase: 'after',
      result: { type: 'ok', resourcesGained: { clay: 3 } },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

})
