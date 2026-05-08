import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/B/B18_GrasslandHarrow'

const CARD_ID = 'B18_GrasslandHarrow'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (round: number, ...players: PlayerState[]): GameState =>
  ({
    round, currentPlayerIndex: 0, players,
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

describe('B18 GrasslandHarrow — after-pay listener', () => {
  it('listener registered with actions:[pay] and after phase', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')
    expect(listener).toBeDefined()
    expect(listener!.actions).toEqual(['pay'])
    expect(listener!.phases).toEqual(['after'])
    expect(listener!.cardIds).toEqual([CARD_ID])
  })

  it('reserve 0: silent return (no future meeple queued)', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    // Post-pay: zero building resources left in supply
    const state = createState(3, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement-any'),
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'ok', resourcesPaid: { wood: 2 } },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('reserve = sum(wood/clay/stone/reed): queues future meeple at current+reserve', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    // After paying: supply has 1 of each building resource → reserve = 4
    player.resources = { ...player.resources, wood: 1, clay: 1, stone: 1, reed: 1 }
    const state = createState(3, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement-any'),
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'ok', resourcesPaid: { wood: 2 } },
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
    expect(state.pendingFutureMeeples.length).toBe(1)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      // current round 3 + reserve 4 = round 7
      expect(req.entries.map((e) => e.round)).toEqual([7])
      expect(req.cardId).toBe(CARD_ID)
      expect(req.playerId).toBe('p1')
    } else {
      throw new Error('expected entries-shaped future request')
    }
  })

  it('clamps target round to 14', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 5, clay: 5, stone: 5, reed: 5 }
    const state = createState(12, player)
    executeCardListener(listener, {
      state, player, space: createSpace('improvement-any'),
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'ok', resourcesPaid: {} },
    } as unknown as CardListenerContext)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      expect(req.entries[0]!.round).toBe(14)
    } else {
      throw new Error('expected entries-shaped future request')
    }
  })

  it('no trigger when sourceCard is another card (B18 only fires on its own pay)', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 2, clay: 2, stone: 2, reed: 2 }
    const state = createState(3, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement-any'),
      actionId: 'pay', phase: 'after',
      sourceCard: 'OtherCard',
      result: { type: 'ok', resourcesPaid: { wood: 1 } },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('no trigger when result is not ok (pay cancelled / failed)', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 2, clay: 2, stone: 2, reed: 2 }
    const state = createState(3, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement-any'),
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'fail', logKey: 'log.payFail' },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('onBuy no longer emits future meeples (migrated to listener)', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 2, clay: 2, stone: 2, reed: 2 }
    const state = createState(3, player)
    const flow = effect!.onBuy?.(state, player)
    expect(flow).toBeUndefined()
    // onBuy must NOT queue any future meeple now — listener owns that.
    expect(state.pendingFutureMeeples.length).toBe(0)
  })
})
