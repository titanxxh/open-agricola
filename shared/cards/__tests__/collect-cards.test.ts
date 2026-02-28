import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearCardListeners,
  getRegisteredCardListeners,
  registerCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace, Resource } from '../../game/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

describe('Collect action card listeners', () => {
  beforeEach(() => {
    clearCardListeners()
  })

  const createMockContext = (
    overrides: Partial<{
      state: Partial<GameState>
      player: Partial<PlayerState>
      space: Partial<ActionSpace>
      actionId: string
      phase: string
      result: { resourcesGained?: Partial<Resource> }
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
      actionId: overrides.actionId ?? 'collect',
      phase: overrides.phase ?? 'during',
      result: overrides.result,
    }
  }

  const boarSpearDuringListener: any = {
    id: 'E53-boar-spear-during',
    phases: ['during' as ActionHookPhase],
    handler: (context: any): ActionHookResult | void => {
      const { actionId, result } = context
      
      if (actionId !== 'collect') return
      
      const obtainedBoar = result?.resourcesGained?.boar ?? 0
      if (obtainedBoar <= 0) return
      
      return {
        flow: {
          type: 'xor',
          children: [
            { type: 'leaf', actionId: 'exchange', optional: true },
          ],
        },
      }
    },
  }

  const mushroomCollectorImmediatelyAfterListener: any = {
    id: 'A108-mushroom-collector-immediately-after',
    phases: ['immediatelyAfter' as ActionHookPhase],
    handler: (context: any): ActionHookResult | void => {
      const { actionId, result } = context
      
      if (actionId !== 'collect') return
      
      const obtainedWood = result?.resourcesGained?.wood ?? 0
      if (obtainedWood <= 0) return
      
      return {
        flow: {
          type: 'xor',
          children: [
            { type: 'leaf', actionId: 'exchange', optional: true },
          ],
        },
      }
    },
  }

  const reclamationPlowAfterListener: any = {
    id: 'A17-reclamation-plow-after',
    phases: ['after' as ActionHookPhase],
    handler: (context: any): ActionHookResult | void => {
      const { actionId, result, player } = context
      
      if (actionId !== 'collect') return
      
      const animals = ['sheep', 'boar', 'cattle'] as const
      let totalObtained = 0
      for (const animal of animals) {
        totalObtained += result?.resourcesGained?.[animal] ?? 0
      }
      
      if (totalObtained <= 0) return
      
      const canAccommodate = 
        (player.houseAnimalType !== null && player.houseAnimalCount < player.rooms * 2) ||
        Object.values(player.stableTiles || {}).some(t => t === null)
      
      if (!canAccommodate) return
      
      return {
        flow: {
          type: 'xor',
          children: [
            { type: 'leaf', actionId: 'plow', optional: true },
          ],
        },
      }
    },
  }

  describe('E53_BoarSpear', () => {
    beforeEach(() => {
      registerCardListener(boarSpearDuringListener)
    })

    it('registers during listener', () => {
      const listeners = getRegisteredCardListeners()
      const boarSpearListeners = listeners.filter(l => l.id.startsWith('E53'))
      expect(boarSpearListeners.length).toBe(1)
      expect(boarSpearListeners[0].phases?.includes('during')).toBe(true)
    })

    it('allows exchange when boar is obtained during collect', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'E53-boar-spear-during')
      
      const context = createMockContext({
        actionId: 'collect',
        phase: 'during',
        result: { resourcesGained: { boar: 1 } },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeDefined()
      expect(result?.flow).toBeDefined()
      expect(result?.flow?.type).toBe('xor')
      expect((result?.flow as any)?.children?.[0]?.actionId).toBe('exchange')
    })

    it('does not trigger when no boar obtained', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'E53-boar-spear-during')
      
      const context = createMockContext({
        actionId: 'collect',
        phase: 'during',
        result: { resourcesGained: { wood: 3 } },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeUndefined()
    })

    it('does not trigger for non-collect actions', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'E53-boar-spear-during')
      
      const context = createMockContext({
        actionId: 'gain',
        phase: 'during',
        result: { resourcesGained: { boar: 1 } },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeUndefined()
    })
  })

  describe('A108_MushroomCollector', () => {
    beforeEach(() => {
      registerCardListener(mushroomCollectorImmediatelyAfterListener)
    })

    it('registers immediatelyAfter listener', () => {
      const listeners = getRegisteredCardListeners()
      const mushroomListeners = listeners.filter(l => l.id.startsWith('A108'))
      expect(mushroomListeners.length).toBe(1)
      expect(mushroomListeners[0].phases?.includes('immediatelyAfter')).toBe(true)
    })

    it('allows exchange when wood is obtained during collect', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'A108-mushroom-collector-immediately-after')
      
      const context = createMockContext({
        actionId: 'collect',
        phase: 'immediatelyAfter',
        result: { resourcesGained: { wood: 1 } },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeDefined()
      expect(result?.flow).toBeDefined()
      expect(result?.flow?.type).toBe('xor')
      expect((result?.flow as any)?.children?.[0]?.actionId).toBe('exchange')
    })

    it('does not trigger when no wood obtained', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'A108-mushroom-collector-immediately-after')
      
      const context = createMockContext({
        actionId: 'collect',
        phase: 'immediatelyAfter',
        result: { resourcesGained: { sheep: 1 } },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeUndefined()
    })
  })

  describe('A17_ReclamationPlow', () => {
    beforeEach(() => {
      registerCardListener(reclamationPlowAfterListener)
    })

    it('registers after listener', () => {
      const listeners = getRegisteredCardListeners()
      const reclamationListeners = listeners.filter(l => l.id.startsWith('A17'))
      expect(reclamationListeners.length).toBe(1)
      expect(reclamationListeners[0].phases?.includes('after')).toBe(true)
    })

    it('allows plow when animals obtained and can accommodate in house', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'A17-reclamation-plow-after')
      
      const context = createMockContext({
        actionId: 'collect',
        phase: 'after',
        result: { resourcesGained: { sheep: 1 } },
        player: {
          houseAnimalType: 'sheep',
          houseAnimalCount: 1,
          rooms: 2,
          stableTiles: {},
        },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeDefined()
      expect(result?.flow).toBeDefined()
      expect(result?.flow?.type).toBe('xor')
      expect((result?.flow as any)?.children?.[0]?.actionId).toBe('plow')
    })

    it('allows plow when animals obtained and can accommodate in stable', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'A17-reclamation-plow-after')
      
      const context = createMockContext({
        actionId: 'collect',
        phase: 'after',
        result: { resourcesGained: { boar: 1 } },
        player: {
          houseAnimalType: null,
          houseAnimalCount: 0,
          rooms: 1,
          stableTiles: { '0-0': null },
        },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeDefined()
      expect(result?.flow).toBeDefined()
    })

    it('does not trigger when no animals obtained', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'A17-reclamation-plow-after')
      
      const context = createMockContext({
        actionId: 'collect',
        phase: 'after',
        result: { resourcesGained: { wood: 3 } },
        player: {
          houseAnimalType: 'sheep',
          houseAnimalCount: 1,
          rooms: 2,
        },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeUndefined()
    })

    it('does not trigger when cannot accommodate animals', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'A17-reclamation-plow-after')
      
      const context = createMockContext({
        actionId: 'collect',
        phase: 'after',
        result: { resourcesGained: { sheep: 2 } },
        player: {
          houseAnimalType: null,
          houseAnimalCount: 0,
          rooms: 0,
          stableTiles: {},
        },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeUndefined()
    })
  })
})
