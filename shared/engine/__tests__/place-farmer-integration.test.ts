import { describe, it, expect, beforeEach } from 'vitest'
import type { ActionDefinition, ActionSpace, GameState, PlayerState } from '../../contract/types'
import { actionDefinitions } from '../../actions'
import { createActionSpaces } from '../../actions'
import { HookDispatcher } from '../dispatcher'
import { executeCardListener } from '../../cards/card-listeners'
import type { CardListenerContext } from '../../cards/card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import type { Resource } from '../../contract/types'

import { markAllWorkersUsed, setWorkersAtHome, workersAvailable } from '../../domain/player'
import { CardRegistry } from '../../../shared/cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../../shared/cards/active-registry'
import type { CardListenerContext } from '../../cards/card-listeners'
const createState = (overrides: Partial<GameState> = {}): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: createActionSpaces(),
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  ...overrides,
} as GameState)

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  ...overrides,
} as PlayerState)

const createSpace = (action: ActionDefinition): ActionSpace => ({
  ...action,
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  takenBy: [],
})

const RESOURCE_MAP: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

describe('PlaceFarmer card integration', () => {
  let dispatcher: HookDispatcher
  let state: GameState
  let player: PlayerState

  beforeEach(() => {
    setActiveCardRegistry(new CardRegistry())
    dispatcher = new HookDispatcher()
    state = createState()
    player = createPlayer()
    state.players = [player]
  })

  describe('A126_MasterWorkman integration', () => {
    it('applies resource bonus during round 1-4 actions', () => {
      const listener = {
        id: 'test-A126-during',
        phases: ['during' as ActionHookPhase],
        handler: (context: CardListenerContext) => {
          const { state, space } = context
          const round = state.round
          if (round >= 1 && round <= 4 && space.roundAvailable) {
            const resource = RESOURCE_MAP[round - 1]
            return { costs: { [resource]: -1 } }
          }
        },
      }
      requireActiveCardRegistry('place-farmer-integration').registerListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)
      state.round = 2

      const phase = dispatcher.during({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'during', result: { type: 'ok' } } as unknown as CardListenerContext)
      expect(result?.costs).toBeDefined()
      expect(result?.costs?.clay).toBe(-1)
    })

    it('does not apply bonus outside rounds 1-4', () => {
      const listener = {
        id: 'test-A126-during',
        phases: ['during' as ActionHookPhase],
        handler: (context: CardListenerContext) => {
          const { state, space } = context
          const round = state.round
          if (round >= 1 && round <= 4 && space.roundAvailable) {
            const resource = RESOURCE_MAP[round - 1]
            return { costs: { [resource]: -1 } }
          }
        },
      }
      requireActiveCardRegistry('place-farmer-integration').registerListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)
      state.round = 5

      const phase = dispatcher.during({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'during', result: { type: 'ok' } } as unknown as CardListenerContext)
      expect(result).toBeUndefined()
    })
  })

  describe('C025_SteamMachine integration', () => {
    it('allows bake-bread after accumulation space when no workers', () => {
      const listener = {
        id: 'test-C25-after',
        phases: ['immediatelyAfter' as ActionHookPhase],
        handler: (context: CardListenerContext) => {
          const { state, player, space } = context
          if (workersAvailable(state, player) > 0) return
          const hasAccumulation = Object.keys(space.gainPerRound).length > 0
          if (!hasAccumulation) return
          return { followUpActions: ['bake-bread'] }
        },
      }
      requireActiveCardRegistry('place-farmer-integration').registerListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)
      space.gainPerRound = { wood: 3 }
      markAllWorkersUsed(state, player)
      const phase = dispatcher.immediatelyAfter({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'immediatelyAfter', result: { type: 'ok' } } as unknown as CardListenerContext)
      expect(result?.followUpActions).toContain('bake-bread')
    })

    it('does not allow bake-bread when workers available', () => {
      const listener = {
        id: 'test-C25-after',
        phases: ['immediatelyAfter' as ActionHookPhase],
        handler: (context: CardListenerContext) => {
          const { state, player, space } = context
          if (workersAvailable(state, player) > 0) return
          const hasAccumulation = Object.keys(space.gainPerRound).length > 0
          if (!hasAccumulation) return
          return { followUpActions: ['bake-bread'] }
        },
      }
      requireActiveCardRegistry('place-farmer-integration').registerListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)
      space.gainPerRound = { wood: 3 }
      setWorkersAtHome(state, player, 1)
      const phase = dispatcher.immediatelyAfter({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'immediatelyAfter', result: { type: 'ok' } } as unknown as CardListenerContext)
      expect(result).toBeUndefined()
    })
  })

  describe('C052_HuntsmansHat integration', () => {
    it('modifies flow for sheep-market', () => {
      const listener = {
        id: 'test-C52-during',
        phases: ['during' as ActionHookPhase],
        handler: (context: CardListenerContext) => {
          const { actionId } = context
          if (actionId === 'sheep-market') {
            return {
              flow: {
                type: 'xor',
                children: [
                  { type: 'leaf', actionId: 'gain', optional: false },
                ],
              },
            }
          }
        },
      }
      requireActiveCardRegistry('place-farmer-integration').registerListener(listener)

      const sheepMarket = actionDefinitions.find(a => a.id === 'sheep-market')!
      const space = createSpace(sheepMarket)

      const phase = dispatcher.during({ state, player, space, actionId: 'sheep-market' }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'sheep-market', phase: 'during', result: { type: 'ok' } } as unknown as CardListenerContext)
      expect(result?.flow).toBeDefined()
    })
  })

  describe('C075_Firewood integration', () => {
    it('registers after hook for return home effect', () => {
      const listener = {
        id: 'test-C75-after',
        phases: ['after' as ActionHookPhase],
        handler: (_context: CardListenerContext) => {
          return {
            flow: {
              type: 'seq',
              children: [
                { type: 'leaf', actionId: 'special-effect', optional: true },
              ],
            },
          }
        },
      }
      requireActiveCardRegistry('place-farmer-integration').registerListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)

      const phase = dispatcher.after({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'after', result: { type: 'ok' } } as unknown as CardListenerContext)
      expect(result?.flow).toBeDefined()
    })
  })
})
