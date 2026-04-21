import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../D/D50_ForeignAid'
import { getBlockedSpaceIds } from '../D/D50_ForeignAid'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'D50_ForeignAid'

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
    actionSpaces: [
      createSpace('forest'),
      createSpace('farmland'),
      createSpace('cultivation'),
      createSpace('urgent-wish-children'),
      createSpace('farm-redevelopment'),
    ],
    log: [], roundStartSnapshot: null,
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

describe('D50_ForeignAid', () => {
  describe('onBuy', () => {
    it('returns gain 6 food flow', () => {
      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const player = createPlayer()
      const state = createState(player)
      const flow = effect!.onBuy!(state, player)
      expect(flow).toBeDefined()
      expect((flow as Extract<ActionFlow, { type: 'leaf' }>)?.actionId).toBe('gain')
      expect((flow as Extract<ActionFlow, { type: 'leaf' }>)?.params?.food).toBe(6)
    })
  })

  describe('getBlockedSpaceIds', () => {
    it('returns space IDs for rounds 12-14', () => {
      const state = createState(createPlayer())
      const blocked = getBlockedSpaceIds(state)
      expect(blocked.size).toBe(3)
      expect(blocked.has('cultivation')).toBe(true)       // round 12
      expect(blocked.has('urgent-wish-children')).toBe(true) // round 13
      expect(blocked.has('farm-redevelopment')).toBe(true) // round 14
    })

    it('returns empty set when roundActionOrder has nulls for rounds 12-14', () => {
      const state = createState(createPlayer())
      state.roundActionOrder[11] = null
      state.roundActionOrder[12] = null
      state.roundActionOrder[13] = null
      const blocked = getBlockedSpaceIds(state)
      expect(blocked.size).toBe(0)
    })
  })

  describe('computeArgs place-farmer', () => {
    it('filters out rounds 12-14 spaces from options', () => {
      const listener = findListener('D50-foreign-aid-compute-args-place-farmer')!
      expect(listener).toBeDefined()
      const player = createPlayer()
      const state = createState(player)
      const result = {
        type: 'choice' as const,
        options: [
          { value: 'forest', labelKey: 'actions.forest.name' },
          { value: 'farmland', labelKey: 'actions.farmland.name' },
          { value: 'cultivation', labelKey: 'actions.cultivation.name' },
          { value: 'urgent-wish-children', labelKey: 'actions.urgent-wish-children.name' },
          { value: 'farm-redevelopment', labelKey: 'actions.farm-redevelopment.name' },
        ],
      }
      executeCardListener(listener, {
        state, player,
        actionId: 'place-farmer', phase: 'computeArgs',
        result,
      } as any)
      // Only non-blocked spaces remain
      expect(result.options).toHaveLength(2)
      expect(result.options.map(o => o.value)).toEqual(['forest', 'farmland'])
    })


    it('does nothing when result is not a choice', () => {
      const listener = findListener('D50-foreign-aid-compute-args-place-farmer')!
      const player = createPlayer()
      const state = createState(player)
      const result = { type: 'ok' as const }
      // Should not throw
      executeCardListener(listener, {
        state, player,
        actionId: 'place-farmer', phase: 'computeArgs',
        result,
      } as any)
    })

    it('does not filter early-round spaces', () => {
      const listener = findListener('D50-foreign-aid-compute-args-place-farmer')!
      const player = createPlayer()
      const state = createState(player)
      const result = {
        type: 'choice' as const,
        options: [
          { value: 'forest', labelKey: 'actions.forest.name' },
          { value: 'sheep-market', labelKey: 'actions.sheep-market.name' },
        ],
      }
      executeCardListener(listener, {
        state, player,
        actionId: 'place-farmer', phase: 'computeArgs',
        result,
      } as any)
      // Both options remain (neither is in rounds 12-14)
      expect(result.options).toHaveLength(2)
    })
  })
})
