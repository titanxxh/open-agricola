import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { getCardEffect, runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../contract/types'

import '../A/A20_DoubleTurnPlow'
import { A20_DoubleTurnPlow as A20Card } from '../../cards/A/A20_DoubleTurnPlow'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'A20_DoubleTurnPlow'

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

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('A20_DoubleTurnPlow', () => {
  it('card definition has correct cost and maxRound', () => {
    expect(A20Card.cost).toEqual({ grain: 1 })
    expect(A20Card.maxRound).toBe(5)
    expect(A20Card.evenMoreSet).toBe(true)
  })

  it('onBuy returns seq flow with 2 optional plow actions', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).not.toBeNull()
    const player = createPlayer()
    const state = createState(player)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children).toHaveLength(2)
    expect(seq.children[0].actionId).toBe('plow')
    expect(seq.children[0].optional).toBe(true)
    expect(seq.children[0].sourceCard).toBe(CARD_ID)
    expect(seq.children[1].actionId).toBe('plow')
    expect(seq.children[1].optional).toBe(true)
    expect(seq.children[1].sourceCard).toBe(CARD_ID)
  })

  it('computeCosts adds 1 food after round 3', () => {
    const listener = findListener('A20-double-turn-plow-compute-costs')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    const state = createState(player)
    state.round = 4

    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement'),
      actionId: 'improvement', phase: 'computeCosts',
      cardId: CARD_ID,
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.costs).toEqual({ food: 1 })
  })

  it('computeCosts does not add food in round 3 or before', () => {
    const listener = findListener('A20-double-turn-plow-compute-costs')!
    const player = createPlayer()
    const state = createState(player)
    state.round = 3

    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement'),
      actionId: 'improvement', phase: 'computeCosts',
      cardId: CARD_ID,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('computeCosts does not trigger for a different card', () => {
    const listener = findListener('A20-double-turn-plow-compute-costs')!
    const player = createPlayer()
    const state = createState(player)
    state.round = 5

    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement'),
      actionId: 'improvement', phase: 'computeCosts',
      cardId: 'SomeOtherCard',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
