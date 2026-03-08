import { describe, it, expect, beforeEach } from 'vitest'
import type { ActionDefinition, ActionSpace, GameState, PlayerState } from '../../game/types'
import { actionDefinitions } from '../../actions'
import { createActionSpaces } from '../../actions'
import { HookDispatcher } from '../dispatcher'
import { clearCardListeners, registerCardListener, executeCardListener } from '../../cards/card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import type { Resource } from '../../game/types'

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
  familySize: 2,
  workersAvailable: 2,
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
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
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
  takenBy: null,
})

const RESOURCE_MAP: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

describe('PlaceFarmer card integration', () => {
  let dispatcher: HookDispatcher
  let state: GameState
  let player: PlayerState

  beforeEach(() => {
    clearCardListeners()
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
        handler: (context: any) => {
          const { state, space } = context
          const round = state.round
          if (round >= 1 && round <= 4 && space.roundAvailable) {
            const resource = RESOURCE_MAP[round - 1]
            return { costs: { [resource]: -1 } }
          }
        },
      }
      registerCardListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)
      state.round = 2

      const phase = dispatcher.during({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'during', result: { type: 'ok' } } as any)
      expect(result?.costs).toBeDefined()
      expect(result?.costs?.clay).toBe(-1)
    })

    it('does not apply bonus outside rounds 1-4', () => {
      const listener = {
        id: 'test-A126-during',
        phases: ['during' as ActionHookPhase],
        handler: (context: any) => {
          const { state, space } = context
          const round = state.round
          if (round >= 1 && round <= 4 && space.roundAvailable) {
            const resource = RESOURCE_MAP[round - 1]
            return { costs: { [resource]: -1 } }
          }
        },
      }
      registerCardListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)
      state.round = 5

      const phase = dispatcher.during({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'during', result: { type: 'ok' } } as any)
      expect(result).toBeUndefined()
    })
  })

  describe('C25_SteamMachine integration', () => {
    it('allows bake-bread after accumulation space when no workers', () => {
      const listener = {
        id: 'test-C25-after',
        phases: ['immediatelyAfter' as ActionHookPhase],
        handler: (context: any) => {
          const { player, space } = context
          if (player.workersAvailable > 0) return
          const hasAccumulation = Object.keys(space.gainPerRound).length > 0
          if (!hasAccumulation) return
          return { followUpActions: ['bake-bread'] }
        },
      }
      registerCardListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)
      space.gainPerRound = { wood: 3 }
      player.workersAvailable = 0

      const phase = dispatcher.immediatelyAfter({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'immediatelyAfter', result: { type: 'ok' } } as any)
      expect(result?.followUpActions).toContain('bake-bread')
    })

    it('does not allow bake-bread when workers available', () => {
      const listener = {
        id: 'test-C25-after',
        phases: ['immediatelyAfter' as ActionHookPhase],
        handler: (context: any) => {
          const { player, space } = context
          if (player.workersAvailable > 0) return
          const hasAccumulation = Object.keys(space.gainPerRound).length > 0
          if (!hasAccumulation) return
          return { followUpActions: ['bake-bread'] }
        },
      }
      registerCardListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)
      space.gainPerRound = { wood: 3 }
      player.workersAvailable = 1

      const phase = dispatcher.immediatelyAfter({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'immediatelyAfter', result: { type: 'ok' } } as any)
      expect(result).toBeUndefined()
    })
  })

  describe('C52_HuntsmansHat integration', () => {
    it('modifies flow for sheep-market', () => {
      const listener = {
        id: 'test-C52-during',
        phases: ['during' as ActionHookPhase],
        handler: (context: any) => {
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
      registerCardListener(listener)

      const sheepMarket = actionDefinitions.find(a => a.id === 'sheep-market')!
      const space = createSpace(sheepMarket)

      const phase = dispatcher.during({ state, player, space, actionId: 'sheep-market' }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'sheep-market', phase: 'during', result: { type: 'ok' } } as any)
      expect(result?.flow).toBeDefined()
    })
  })

  describe('C75_Firewood integration', () => {
    it('registers after hook for return home effect', () => {
      const listener = {
        id: 'test-C75-after',
        phases: ['after' as ActionHookPhase],
        handler: (_context: any) => {
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
      registerCardListener(listener)

      const forestAction = actionDefinitions.find(a => a.id === 'forest')!
      const space = createSpace(forestAction)

      const phase = dispatcher.after({ state, player, space }, { type: 'ok' })
      const matched = phase.matchedListeners
      expect(matched.length).toBeGreaterThan(0)

      const result = executeCardListener(matched[0].registration, { state, player, space, actionId: 'forest', phase: 'after', result: { type: 'ok' } } as any)
      expect(result?.flow).toBeDefined()
    })
  })
})
