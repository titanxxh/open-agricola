import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../contract/types'

import '../D/D017_DrillHarrow'
import { D017_DrillHarrow as D17Card } from '../../cards/D/D017_DrillHarrow'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'D017_DrillHarrow'

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

describe('D017_DrillHarrow', () => {
  it('card definition has correct properties', () => {
    expect(D17Card.cost).toEqual({ wood: 1 })
    expect(D17Card.evenMoreSet).toBe(true)
  })

  describe('before sow listener', () => {
    it('returns optional pay+plow flow before unconditional sow', () => {
      const listener = findListener('D17-drill-harrow-before-sow')!
      expect(listener).toBeDefined()
      const player = createPlayer()
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'before',
      } as unknown as CardListenerContext)

      expect(result).toBeDefined()
      const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
      expect(flow.type).toBe('seq')
      expect(flow.optional).toBe(true)
      expect(flow.children).toHaveLength(2)
      // First child: pay 3 food
      expect(flow.children[0].actionId).toBe('pay')
      expect(flow.children[0].params).toEqual({ food: 3 })
      expect(flow.children[0].sourceCard).toBe(CARD_ID)
      // Second child: plow
      expect(flow.children[1].actionId).toBe('plow')
      expect(flow.children[1].sourceCard).toBe(CARD_ID)
    })

    it('does not trigger for conditional sow (maxSelections set)', () => {
      const listener = findListener('D17-drill-harrow-before-sow')!
      const player = createPlayer()
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'before',
        actionContext: { maxSelections: 1 },
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('does not trigger for conditional sow (cropType set)', () => {
      const listener = findListener('D17-drill-harrow-before-sow')!
      const player = createPlayer()
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'before',
        actionContext: { cropType: 'grain' },
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('does not trigger for checkedReplaceAction sow', () => {
      const listener = findListener('D17-drill-harrow-before-sow')!
      const player = createPlayer()
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'before',
        actionContext: { checkedReplaceAction: true },
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

  })

  describe('isDoable listener', () => {
    it('makes sow doable when player has 3+ food', () => {
      const listener = findListener('D17-drill-harrow-isdoable-sow')!
      expect(listener).toBeDefined()
      const player = createPlayer()
      player.resources.food = 3
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'isDoable',
        doable: false,
      } as unknown as CardListenerContext)

      expect(result).toBeDefined()
      expect(result!.doable).toBe(true)
    })

    it('does not make sow doable when player has less than 3 food', () => {
      const listener = findListener('D17-drill-harrow-isdoable-sow')!
      const player = createPlayer()
      player.resources.food = 2
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'isDoable',
        doable: false,
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('does not intervene when sow is already doable', () => {
      const listener = findListener('D17-drill-harrow-isdoable-sow')!
      const player = createPlayer()
      player.resources.food = 5
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'isDoable',
        doable: true,
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('does not trigger for conditional sow', () => {
      const listener = findListener('D17-drill-harrow-isdoable-sow')!
      const player = createPlayer()
      player.resources.food = 5
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'isDoable',
        doable: false,
        actionContext: { maxSelections: 1 },
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })
  })
})
