import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../contract/types'

import '../E/E105_Pioneer'
import { getMostRecentlyRevealedSpaceId } from '../E/E105_Pioneer'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'E105_Pioneer'

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
    round: 5, currentPlayerIndex: 0, players,
    actionSpaces: [],
    log: [],
    roundActionOrder: [
      'sheep-market', 'grain-utilization', 'fencing', 'major-improvement',
      'wish-children', 'western-quarry', 'house-redevelopment',
      'vegetable-seeds', 'pig-market',
      'eastern-quarry', 'cattle-market',
      'cultivation', 'urgent-wish-children',
      'farm-redevelopment',
    ],
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('E105_Pioneer', () => {
  describe('onBuy', () => {
    it('returns XOR choice of building resource + food', () => {
      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const player = createPlayer()
      const state = createState(player)
      const flow = effect!.onBuy!(state, player) as Extract<ActionFlow, { type: 'seq' }>
      expect(flow).toBeDefined()
      expect(flow.type).toBe('xor')
      expect(flow.children).toHaveLength(4)
      // Check each option offers 1 building resource + 1 food
      expect(flow.children[0].params).toEqual({ wood: 1, food: 1 })
      expect(flow.children[1].params).toEqual({ clay: 1, food: 1 })
      expect(flow.children[2].params).toEqual({ reed: 1, food: 1 })
      expect(flow.children[3].params).toEqual({ stone: 1, food: 1 })
    })
  })

  describe('getMostRecentlyRevealedSpaceId', () => {
    it('returns the space revealed at current round', () => {
      const state = createState(createPlayer())
      state.round = 5
      expect(getMostRecentlyRevealedSpaceId(state)).toBe('wish-children') // index 4
    })

    it('returns the space for round 1', () => {
      const state = createState(createPlayer())
      state.round = 1
      expect(getMostRecentlyRevealedSpaceId(state)).toBe('sheep-market') // index 0
    })

    it('returns null for round 0', () => {
      const state = createState(createPlayer())
      state.round = 0
      expect(getMostRecentlyRevealedSpaceId(state)).toBeNull()
    })

    it('returns null when roundActionOrder entry is null', () => {
      const state = createState(createPlayer())
      state.round = 5
      state.roundActionOrder[4] = null
      expect(getMostRecentlyRevealedSpaceId(state)).toBeNull()
    })
  })

  describe('after place-farmer on most recently revealed space', () => {
    it('returns XOR choice when placing on the last revealed space', () => {
      const listener = findListener('E105-pioneer-after-place-farmer')!
      expect(listener).toBeDefined()
      const player = createPlayer()
      const state = createState(player)
      state.round = 5 // revealed: wish-children (index 4)
      const result = executeCardListener(listener, {
        state, player, space: createSpace('wish-children'),
        actionId: 'place-farmer', phase: 'after',
      } as unknown as CardListenerContext)
      expect(result).toBeDefined()
      const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
      expect(flow.type).toBe('xor')
      expect(flow.children).toHaveLength(4)
      expect(flow.children[0].params).toEqual({ wood: 1, food: 1 })
    })

    it('does not trigger for non-latest revealed space', () => {
      const listener = findListener('E105-pioneer-after-place-farmer')!
      const player = createPlayer()
      const state = createState(player)
      state.round = 5 // revealed: wish-children
      const result = executeCardListener(listener, {
        state, player, space: createSpace('sheep-market'),
        actionId: 'place-farmer', phase: 'after',
      } as unknown as CardListenerContext)
      expect(result).toBeUndefined()
    })


    it('does not trigger on round 1 for non-matching base action space', () => {
      const listener = findListener('E105-pioneer-after-place-farmer')!
      const player = createPlayer()
      const state = createState(player)
      state.round = 1 // revealed: sheep-market
      const result = executeCardListener(listener, {
        state, player, space: createSpace('forest'), // forest is base, not round-action
        actionId: 'place-farmer', phase: 'after',
      } as unknown as CardListenerContext)
      expect(result).toBeUndefined()
    })
  })
})
