import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearCardListeners,
  getRegisteredCardListeners,
  registerCardListener,
  type CardListenerRegistration,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../game/types'

describe('PlaceFarmer card listeners', () => {
  beforeEach(() => {
    clearCardListeners()
  })

  const RESOURCE_MAP: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

  const masterWorkmanDuringListener: CardListenerRegistration = {
    id: 'A126-master-workman-during',
    phases: ['during' as ActionHookPhase],
    handler: (context: any): ActionHookResult | void => {
      const { state, space } = context
      const round = state.round
      
      if (round >= 1 && round <= 4 && space.roundAvailable) {
        const resource = RESOURCE_MAP[round - 1]
        return { costs: { [resource]: -1 } }
      }
    },
  }

  const masterWorkmanComputeArgsListener: CardListenerRegistration = {
    id: 'A126-master-workman-compute-args',
    phases: ['computeArgs' as ActionHookPhase],
    handler: (context: any): ActionHookResult | void => {
      const { state } = context
      const round = state.round
      
      if (round >= 1 && round <= 4) {
        return {
          extraOptions: state.actionSpaces
            .filter((space: any) => space.roundAvailable >= 1 && space.roundAvailable <= 4)
            .map((space: any) => ({
              value: space.id,
              labelKey: space.nameKey,
              labelParams: { resources: 'ignore' },
            })),
        }
      }
    },
  }

  const steamMachineListener: CardListenerRegistration = {
    id: 'C25-steam-machine-immediately-after',
    phases: ['immediatelyAfter' as ActionHookPhase],
    handler: (context: any): ActionHookResult | void => {
      const { player, space } = context
      
      if (player.workersAvailable > 0) {
        return
      }

      const hasAccumulation = Object.keys(space.gainPerRound).length > 0
      if (!hasAccumulation) {
        return
      }

      return {
        followUpActions: ['bake-bread'],
      }
    },
  }

  const huntsmansHatListener: CardListenerRegistration = {
    id: 'C52-huntsmans-hat-during',
    phases: ['during' as ActionHookPhase],
    handler: (context: any): ActionHookResult | void => {
      const { actionId } = context
      
      if (actionId === 'sheep-market') {
        return {
          flow: {
            type: 'xor',
            children: [
              { type: 'leaf', actionId: 'gain', optional: false },
              { type: 'leaf', actionId: 'gain', optional: false },
            ],
          },
        }
      }
    },
  }

  const firewoodReturnHomeListener: CardListenerRegistration = {
    id: 'C75-firewood-return-home',
    phases: ['after' as ActionHookPhase],
    handler: (context: any): ActionHookResult | void => {
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

  const createMockContext = (
    overrides: Partial<{
      state: Partial<GameState>
      player: Partial<PlayerState>
      space: Partial<ActionSpace>
      actionId: string
      phase: string
    }> = {},
  ) => {
    const defaultState: GameState = {
      round: 1,
      currentPlayerIndex: 0,
      players: [],
      actionSpaces: [],
      log: [],
      roundStartSnapshot: null,
      roundActionOrder: [],
      gameSeed: 0,
      availableMajorImprovements: [],
      futureMeeples: [],
      pendingFutureMeeples: [],
      gameOver: false,
    }

    const defaultPlayer: PlayerState = {
      id: 'player1',
      name: 'Player 1',
      workersAvailable: 1,
      familyMembers: [],
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
      improvements: [],
      minorHand: [],
      minorPlayed: [],
      occupationHand: [],
      occupationPlayed: [],
      playedCards: [],
      houses: 1,
      fenced: 0,
      stables: 0,
      plowed: 0,
      sewn: [],
      animals: { sheep: 0, boar: 0, cattle: 0 },
      score: 0,
    }

    const defaultSpace: ActionSpace = {
      id: 'forest',
      nameKey: 'actions.forest.name',
      descriptionKey: 'actions.forest.description',
      roundAvailable: 1,
      gainPerRound: { wood: 3 },
      players: [2, 3, 4],
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
      resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
      takenBy: null,
    }

    return {
      state: { ...defaultState, ...overrides.state } as GameState,
      player: { ...defaultPlayer, ...overrides.player } as PlayerState,
      space: { ...defaultSpace, ...overrides.space } as ActionSpace,
      actionId: overrides.actionId ?? 'place-farmer',
      phase: overrides.phase ?? 'during',
    }
  }

  describe('A126_MasterWorkman', () => {
    beforeEach(() => {
      registerCardListener(masterWorkmanDuringListener)
      registerCardListener(masterWorkmanComputeArgsListener)
    })

    it('registers during and computeArgs listeners', () => {
      const listeners = getRegisteredCardListeners()
      const masterWorkmanListeners = listeners.filter(l => l.id.startsWith('A126'))
      expect(masterWorkmanListeners.length).toBe(2)
      expect(masterWorkmanListeners.some(l => l.phases?.includes('during'))).toBe(true)
      expect(masterWorkmanListeners.some(l => l.phases?.includes('computeArgs'))).toBe(true)
    })

    it('gives resource on round 1-4 during phase', () => {
      const listeners = getRegisteredCardListeners()
      const duringListener = listeners.find(l => l.id === 'A126-master-workman-during')
      
      const context = createMockContext({
        state: { round: 2 },
        space: { roundAvailable: 2 },
        phase: 'during',
      })

      const result = duringListener?.handler(context as any)
      expect(result).toBeDefined()
      expect(result?.costs).toBeDefined()
      expect(result?.costs?.clay).toBe(-1)
    })

    it('does not give resource outside rounds 1-4', () => {
      const listeners = getRegisteredCardListeners()
      const duringListener = listeners.find(l => l.id === 'A126-master-workman-during')
      
      const context = createMockContext({
        state: { round: 5 },
        space: { roundAvailable: 5 },
        phase: 'during',
      })

      const result = duringListener?.handler(context as any)
      expect(result).toBeUndefined()
    })
  })

  describe('C25_SteamMachine', () => {
    beforeEach(() => {
      registerCardListener(steamMachineListener)
    })

    it('registers immediatelyAfter listener', () => {
      const listeners = getRegisteredCardListeners()
      const steamMachineListeners = listeners.filter(l => l.id.startsWith('C25'))
      expect(steamMachineListeners.length).toBe(1)
      expect(steamMachineListeners[0].phases?.includes('immediatelyAfter')).toBe(true)
    })

    it('allows bake-bread when no workers and accumulation space', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C25-steam-machine-immediately-after')
      
      const context = createMockContext({
        player: { workersAvailable: 0 },
        space: { gainPerRound: { wood: 3 } },
        phase: 'immediatelyAfter',
      })

      const result = listener?.handler(context as any)
      expect(result).toBeDefined()
      expect(result?.followUpActions).toContain('bake-bread')
    })

    it('does not allow bake-bread when workers available', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C25-steam-machine-immediately-after')
      
      const context = createMockContext({
        player: { workersAvailable: 1 },
        space: { gainPerRound: { wood: 3 } },
        phase: 'immediatelyAfter',
      })

      const result = listener?.handler(context as any)
      expect(result).toBeUndefined()
    })
  })

  describe('C52_HuntsmansHat', () => {
    beforeEach(() => {
      registerCardListener(huntsmansHatListener)
    })

    it('registers during listener', () => {
      const listeners = getRegisteredCardListeners()
      const huntsmansHatListeners = listeners.filter(l => l.id.startsWith('C52'))
      expect(huntsmansHatListeners.length).toBe(1)
      expect(huntsmansHatListeners[0].phases?.includes('during')).toBe(true)
    })
  })

  describe('C75_Firewood', () => {
    beforeEach(() => {
      registerCardListener(firewoodReturnHomeListener)
    })

    it('registers after listener', () => {
      const listeners = getRegisteredCardListeners()
      const firewoodListeners = listeners.filter(l => l.id.startsWith('C75'))
      expect(firewoodListeners.length).toBe(1)
      expect(firewoodListeners[0].phases?.includes('after')).toBe(true)
    })
  })

  describe('E21_SheepRug', () => {
    const sheepRugComputeArgsListener: CardListenerRegistration = {
      id: 'E21-sheep-rug-compute-args',
      phases: ['computeArgs' as ActionHookPhase],
      actions: ['place-farmer'],
      handler: (): ActionHookResult | void => {
        return undefined
      },
    }

    beforeEach(() => {
      registerCardListener(sheepRugComputeArgsListener)
    })

    it('registers computeArgs listener for place-farmer', () => {
      const listeners = getRegisteredCardListeners()
      const sheepRugListeners = listeners.filter(l => l.id.startsWith('E21'))
      expect(sheepRugListeners.length).toBe(1)
      expect(sheepRugListeners[0].phases?.includes('computeArgs')).toBe(true)
      expect(sheepRugListeners[0].actions?.includes('place-farmer')).toBe(true)
    })
  })
})
