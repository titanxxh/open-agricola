import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../../shared/cards/card-listeners'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/C/C42_RavenousHunger'

const CARD_ID = 'C42_RavenousHunger'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
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

const createSpace = (id: string, gainPerRound: Partial<Record<string, number>> = {}): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound,
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C42_RavenousHunger', () => {
  it('after vegetable-seeds: offers place-farmer with flag/unflag sequence', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('vegetable-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as any).children
    expect(children).toHaveLength(3)
    expect(children[0].actionId).toBe('flag-card')
    expect(children[1].actionId).toBe('place-farmer')
    expect(children[2].actionId).toBe('unflag-card')
  })

  it('does not trigger on non-vegetable-seeds spaces', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('grain-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger when no workers available', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    markAllWorkersUsed(state, player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('vegetable-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
  })

  it('after collect while flagged: gains 1 extra of accumulating resource', () => {
    const listener = findListener('C42-ravenous-hunger-after-collect')
    expect(listener).toBeDefined()

    const player = createPlayer()
    setCardFlag(player, CARD_ID, true)
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'collect', phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('leaf')
    expect((result!.flow as any).actionId).toBe('gain')
    expect((result!.flow as any).params).toEqual({ wood: 1 })
  })

  it('after collect when not flagged: no bonus', () => {
    const listener = findListener('C42-ravenous-hunger-after-collect')
    expect(listener).toBeDefined()

    const player = createPlayer()
    // Not flagged
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'collect', phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeUndefined()
  })
})
