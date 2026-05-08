import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../contract/types'

import '../C/C158_ForestCampaigner'
import { countWoodOnAccumulationSpaces } from '../C/C158_ForestCampaigner'
import type { ActionFlow } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'C158_ForestCampaigner'

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

const createAccumulationSpace = (id: string, woodOnSpace: number, gainPerRound: Record<string, number> = { wood: 3 }): ActionSpace =>
  createSpace(id, {
    gainPerRound,
    resources: { wood: woodOnSpace, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  })

const createState = (
  players: PlayerState[],
  actionSpaces: ActionSpace[] = [],
): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces,
    log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C158_ForestCampaigner', () => {
  describe('countWoodOnAccumulationSpaces', () => {
    it('counts wood on forest, grove, copse', () => {
      const state = createState(
        [createPlayer()],
        [
          createAccumulationSpace('forest', 6, { wood: 3 }),
          createAccumulationSpace('grove', 2, { wood: 2 }),
          createAccumulationSpace('copse', 1, { wood: 1 }),
          createSpace('farmland'), // non-accumulation space
        ],
      )
      expect(countWoodOnAccumulationSpaces(state)).toBe(9)
    })

    it('does not count wood on non-accumulation spaces', () => {
      const state = createState(
        [createPlayer()],
        [
          createSpace('farmland', {
            resources: { wood: 5, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
          }),
        ],
      )
      expect(countWoodOnAccumulationSpaces(state)).toBe(0)
    })

    it('counts wood on accumulation spaces that gain non-wood resources', () => {
      // E.g., traveling-players accumulates food, but might have wood on it
      const state = createState(
        [createPlayer()],
        [
          createAccumulationSpace('traveling-players', 3, { food: 1 }),
        ],
      )
      expect(countWoodOnAccumulationSpaces(state)).toBe(3)
    })

    it('returns 0 when no accumulation spaces', () => {
      const state = createState(
        [createPlayer()],
        [createSpace('farmland')],
      )
      expect(countWoodOnAccumulationSpaces(state)).toBe(0)
    })
  })

  describe('before place-farmer', () => {
    it('gains 1 food when 8+ wood on accumulation spaces', () => {
      const listener = findListener('C158-forest-campaigner-before-place-farmer')!
      expect(listener).toBeDefined()
      const player = createPlayer()
      const state = createState(
        [player],
        [
          createAccumulationSpace('forest', 6, { wood: 3 }),
          createAccumulationSpace('grove', 2, { wood: 2 }),
        ],
      )
      // Total = 8
      const result = executeCardListener(listener, {
        state, player, space: createSpace('forest'),
        actionId: 'place-farmer', phase: 'before',
      } as unknown as CardListenerContext)
      expect(result).toBeDefined()
      const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
      expect(leaf.actionId).toBe('gain')
      expect(leaf.params).toEqual({ food: 1 })
    })

    it('does not trigger when less than 8 wood', () => {
      const listener = findListener('C158-forest-campaigner-before-place-farmer')!
      const player = createPlayer()
      const state = createState(
        [player],
        [
          createAccumulationSpace('forest', 3, { wood: 3 }),
          createAccumulationSpace('grove', 4, { wood: 2 }),
        ],
      )
      // Total = 7
      const result = executeCardListener(listener, {
        state, player, space: createSpace('forest'),
        actionId: 'place-farmer', phase: 'before',
      } as unknown as CardListenerContext)
      expect(result).toBeUndefined()
    })

    it('triggers at exactly 8 wood', () => {
      const listener = findListener('C158-forest-campaigner-before-place-farmer')!
      const player = createPlayer()
      const state = createState(
        [player],
        [createAccumulationSpace('forest', 8, { wood: 3 })],
      )
      const result = executeCardListener(listener, {
        state, player, space: createSpace('forest'),
        actionId: 'place-farmer', phase: 'before',
      } as unknown as CardListenerContext)
      expect(result).toBeDefined()
      expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 1 })
    })


    it('triggers regardless of which space the farmer is being placed on', () => {
      const listener = findListener('C158-forest-campaigner-before-place-farmer')!
      const player = createPlayer()
      const state = createState(
        [player],
        [createAccumulationSpace('forest', 10, { wood: 3 })],
      )
      // Placing on farmland (non-accumulation) should still trigger
      const result = executeCardListener(listener, {
        state, player, space: createSpace('farmland'),
        actionId: 'place-farmer', phase: 'before',
      } as unknown as CardListenerContext)
      expect(result).toBeDefined()
    })
  })
})
