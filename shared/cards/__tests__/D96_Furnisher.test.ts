import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { getCardEffect, runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../contract/types'
import { recordActionSnapshot } from '../helpers/action-snapshot'

import '../D/D096_Furnisher'
import type { ActionFlow } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'D096_Furnisher'

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

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('D096_Furnisher', () => {
  it('onBuy returns gain flow for 2 wood', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).not.toBeNull()
    const player = createPlayer()
    const state = createState(player)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 2 })
  })

  it('after construct with 1 room built, offers 1 optional improvement', () => {
    const listener = findListener('D96-furnisher-after-construct')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.roomTiles = [{ row: 0, col: 0 }] as any
    // Record snapshot with 0 rooms, then add 1 room
    recordActionSnapshot(player, 1)
    player.roomTiles.push({ row: 0, col: 1 } as any)

    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(1)
    expect(flow.children[0].children[0].actionId).toBe('improvement')
    expect(flow.children[0].children[0].sourceCard).toBe(CARD_ID)
  })

  it('after construct with 2 rooms built, offers 2 optional improvements', () => {
    const listener = findListener('D96-furnisher-after-construct')!
    const player = createPlayer()
    player.roomTiles = [{ row: 0, col: 0 }] as any
    recordActionSnapshot(player, 1)
    player.roomTiles.push({ row: 0, col: 1 } as any, { row: 0, col: 2 } as any)

    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children).toHaveLength(2)
  })

  it('does not trigger after construct with no new rooms', () => {
    const listener = findListener('D96-furnisher-after-construct')!
    const player = createPlayer()
    player.roomTiles = [{ row: 0, col: 0 }] as any
    recordActionSnapshot(player, 1)
    // No new rooms added

    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('deriveCardCostCandidate derives a wood discount when actionCardId is D096_Furnisher', () => {
    const listener = findListener('D96-furnisher-compute-costs-improvement')!
    expect(listener).toBeDefined()
    const player = createPlayer()

    const result = listener.deriveCardCostCandidate?.({
      state: createState(player), player, space: createSpace('improvement'),
      actionId: 'improvement', phase: 'computeCosts',
      actionCardId: CARD_ID,
    } as unknown as CardListenerContext,
      { resources: { wood: 1 }, originalFeeIndex: 0, sources: [] },
    )

    expect(result).toEqual({
      resources: {},
      originalFeeIndex: 0,
      sources: [CARD_ID],
      costAttribution: { [CARD_ID]: { saved: { wood: 1 } } },
    })
  })

  it('deriveCardCostCandidate does not apply when actionCardId is different', () => {
    const listener = findListener('D96-furnisher-compute-costs-improvement')!
    const player = createPlayer()

    const result = listener.deriveCardCostCandidate?.({
      state: createState(player), player, space: createSpace('improvement'),
      actionId: 'improvement', phase: 'computeCosts',
      actionCardId: 'improvement',
    } as unknown as CardListenerContext,
      { resources: { wood: 1 }, originalFeeIndex: 0, sources: [] },
    )

    expect(result).toBeNull()
  })
})
