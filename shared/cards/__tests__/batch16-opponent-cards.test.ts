import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  getMatchingListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace, ActionFlow } from '../../game/types'

// Import card registrations
import '../B/B163_Pastor'
import '../D/D163_JourneymanBricklayer'
import '../E/E144_WaresSalesman'
import '../B/B138_ForestGuardian'
import '../A/A154_Paymaster'
import '../C/C153_PatternMaker'
import '../D/D149_CasualWorker'
import '../C/C151_SowingDirector'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
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

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
    ...overrides,
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

// ===== B163 Pastor =====
describe('B163_Pastor', () => {
  it('registers a listener with scope any on construct', () => {
    const listener = findListener('B163-pastor-after-construct')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('any')
    expect(listener!.actions).toContain('construct')
    expect(listener!.phases).toContain('after')
  })

  it('triggers when owner is the only player with 2 rooms after construct', () => {
    const listener = findListener('B163-pastor-after-construct')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B163_Pastor']
    p1.rooms = 2
    const p2 = createPlayer('p2', 'P2')
    p2.rooms = 3 // p2 just built and now has 3 rooms
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')
    if (result!.flow?.type === 'seq') {
      const gainNode = result!.flow.children[0]
      expect(gainNode.type).toBe('leaf')
      if (gainNode.type === 'leaf') {
        expect(gainNode.actionId).toBe('gain')
        expect(gainNode.params).toEqual({ wood: 3, clay: 2, reed: 1, stone: 1 })
      }
      // Second child should be flag-card
      const flagNode = result!.flow.children[1]
      expect(flagNode.type).toBe('leaf')
      if (flagNode.type === 'leaf') {
        expect(flagNode.actionId).toBe('flag-card')
      }
    }
  })

  it('does not trigger when another player also has 2 rooms', () => {
    const listener = findListener('B163-pastor-after-construct')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B163_Pastor']
    p1.rooms = 2
    const p2 = createPlayer('p2', 'P2')
    p2.rooms = 2 // p2 also has 2 rooms
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger when owner has more than 2 rooms', () => {
    const listener = findListener('B163-pastor-after-construct')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B163_Pastor']
    p1.rooms = 3
    const p2 = createPlayer('p2', 'P2')
    p2.rooms = 4
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger again after being flagged (one-time)', () => {
    const listener = findListener('B163-pastor-after-construct')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B163_Pastor']
    p1.rooms = 2
    p1.cardStates = { B163_Pastor: { flagged: true } }
    const p2 = createPlayer('p2', 'P2')
    p2.rooms = 3
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })
})

// ===== D163 Journeyman Bricklayer =====
describe('D163_JourneymanBricklayer', () => {
  it('onBuy gives 2 stone', () => {
    const listener = findListener('D163-journeyman-bricklayer-onbuy')!
    const player = createPlayer()
    player.occupationPlayed = ['D163_JourneymanBricklayer']
    const state = createState(player)

    const result = executeCardListener(listener, {
      state, player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'D163_JourneymanBricklayer',
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.actionId).toBe('gain')
      expect(result!.flow.params).toEqual({ stone: 2 })
    }
  })

  it('triggers when opponent renovates to stone', () => {
    const listener = findListener('D163-journeyman-bricklayer-opponent-renovate')!
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D163_JourneymanBricklayer']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'stone' // just renovated to stone
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.actionId).toBe('gain')
      expect(result!.flow.params).toEqual({ stone: 1 })
    }
  })

  it('does not trigger when opponent renovates to clay', () => {
    const listener = findListener('D163-journeyman-bricklayer-opponent-renovate')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D163_JourneymanBricklayer']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'clay'
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })

  it('triggers when opponent builds a stone room', () => {
    const listener = findListener('D163-journeyman-bricklayer-opponent-construct')!
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D163_JourneymanBricklayer']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'stone'
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.actionId).toBe('gain')
      expect(result!.flow.params).toEqual({ stone: 1 })
    }
  })

  it('does not trigger when opponent builds a wood room', () => {
    const listener = findListener('D163-journeyman-bricklayer-opponent-construct')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D163_JourneymanBricklayer']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'wood'
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })
})

// ===== E144 Wares Salesman =====
describe('E144_WaresSalesman', () => {
  it('registers a listener on improvement-any with scope any', () => {
    const listener = findListener('E144-wares-salesman-after-improvement')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('any')
    expect(listener!.actions).toContain('improvement-any')
  })

  it('triggers when a player plays Joinery (wood → food at harvest) → gains wood + reed', () => {
    const listener = findListener('E144-wares-salesman-after-improvement')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E144_WaresSalesman']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'Major_Joinery',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.actionId).toBe('gain')
      expect(result!.flow.params).toEqual({ wood: 1, reed: 1 })
    }
  })

  it('does not trigger for Fireplace (converts animals, not building resources)', () => {
    const listener = findListener('E144-wares-salesman-after-improvement')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E144_WaresSalesman']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'Major_Fireplace1',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger when no choice provided', () => {
    const listener = findListener('E144-wares-salesman-after-improvement')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E144_WaresSalesman']
    const state = createState(p1)

    const result = executeCardListener(listener, {
      state, player: p1, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })
})

// ===== B138 Forest Guardian =====
describe('B138_ForestGuardian', () => {
  it('onBuy gives 2 wood', () => {
    const listener = findListener('B138-forest-guardian-onbuy')!
    const player = createPlayer()
    player.occupationPlayed = ['B138_ForestGuardian']
    const state = createState(player)

    const result = executeCardListener(listener, {
      state, player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'B138_ForestGuardian',
    } as any)

    expect(result).toBeDefined()
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.actionId).toBe('gain')
      expect(result!.flow.params).toEqual({ wood: 2 })
    }
  })

  it('triggers before opponent collect on forest with 5+ wood', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')!
    expect(listener!.scope).toBe('opponent')
    expect(listener!.phases).toContain('before')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B138_ForestGuardian']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)
    const space = createSpace('forest')
    space.resources.wood = 5

    const result = executeCardListener(listener, {
      state, player: p2, space,
      actionId: 'collect', phase: 'before',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')
    if (result!.flow?.type === 'seq') {
      const gainNode = result!.flow.children[0] as ActionFlow
      if (gainNode.type === 'leaf') {
        expect(gainNode.actionId).toBe('gain-trigger-player')
        expect(gainNode.params).toMatchObject({ food: 1, targetPlayerId: 'p1' })
      }
    }
  })

  it('does not trigger on forest with less than 5 wood', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B138_ForestGuardian']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)
    const space = createSpace('forest')
    space.resources.wood = 4

    const result = executeCardListener(listener, {
      state, player: p2, space,
      actionId: 'collect', phase: 'before',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })

  it('triggers on copse with 5+ wood', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B138_ForestGuardian']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)
    const space = createSpace('copse')
    space.resources.wood = 6

    const result = executeCardListener(listener, {
      state, player: p2, space,
      actionId: 'collect', phase: 'before',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
  })

  it('does not trigger on non-wood spaces', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B138_ForestGuardian']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)
    const space = createSpace('clay-pit')
    space.resources.clay = 5

    const result = executeCardListener(listener, {
      state, player: p2, space,
      actionId: 'collect', phase: 'before',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })
})

// ===== A154 Paymaster =====
describe('A154_Paymaster', () => {
  it('registers an opponent listener on place-farmer', () => {
    const listener = findListener('A154-paymaster-opponent-food-accumulation')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')
  })

  it('triggers when opponent uses Fishing', () => {
    const listener = findListener('A154-paymaster-opponent-food-accumulation')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A154_Paymaster']
    p1.resources.grain = 3
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
      ownerPlayer: p1, triggerPlayer: p2,
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')
    if (result!.flow?.type === 'seq') {
      expect(result!.flow.optional).toBe(true)
      // Pay 1 grain
      const payNode = result!.flow.children[0] as ActionFlow
      if (payNode.type === 'leaf') {
        expect(payNode.actionId).toBe('pay-resources')
        expect(payNode.params).toEqual({ grain: 1 })
      }
      // Give grain to opponent
      const giveNode = result!.flow.children[1] as ActionFlow
      if (giveNode.type === 'leaf') {
        expect(giveNode.actionId).toBe('gain-trigger-player')
        expect(giveNode.params).toMatchObject({ grain: 1, targetPlayerId: 'p2' })
      }
      // Bonus VP
      const vpNode = result!.flow.children[2] as ActionFlow
      if (vpNode.type === 'leaf') {
        expect(vpNode.actionId).toBe('bonus-vp')
      }
    }
  })

  it('triggers when opponent uses Traveling Players', () => {
    const listener = findListener('A154-paymaster-opponent-food-accumulation')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A154_Paymaster']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('traveling-players'),
      actionId: 'place-farmer', phase: 'after',
      ownerPlayer: p1, triggerPlayer: p2,
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')
  })

  it('does not trigger on non-food accumulation spaces', () => {
    const listener = findListener('A154-paymaster-opponent-food-accumulation')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A154_Paymaster']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('forest'),
      actionId: 'place-farmer', phase: 'after',
      ownerPlayer: p1, triggerPlayer: p2,
    } as any)

    expect(result).toBeUndefined()
  })

  it('matches via getMatchingListeners for opponent fishing', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A154_Paymaster']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'A154-paymaster-opponent-food-accumulation')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })

  it('does not match when card owner uses fishing', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A154_Paymaster']
    const state = createState(p1)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'A154-paymaster-opponent-food-accumulation')
    expect(found).toBeUndefined()
  })
})

// ===== C153 Pattern Maker =====
describe('C153_PatternMaker', () => {
  it('registers an opponent listener on renovate-house', () => {
    const listener = findListener('C153-pattern-maker-opponent-renovate')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')
    expect(listener!.actions).toContain('renovate-house')
  })

  it('returns optional flow to pay 2 wood for 1 grain + 1 food + 1 VP', () => {
    const listener = findListener('C153-pattern-maker-opponent-renovate')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C153_PatternMaker']
    p1.resources.wood = 5
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')
    if (result!.flow?.type === 'seq') {
      expect(result!.flow.optional).toBe(true)
      expect(result!.flow.children).toHaveLength(3)

      // Pay 2 wood
      const payNode = result!.flow.children[0] as ActionFlow
      if (payNode.type === 'leaf') {
        expect(payNode.actionId).toBe('pay-resources')
        expect(payNode.params).toEqual({ wood: 2 })
      }
      // Bonus VP
      const vpNode = result!.flow.children[1] as ActionFlow
      if (vpNode.type === 'leaf') {
        expect(vpNode.actionId).toBe('bonus-vp')
      }
      // Gain 1 grain + 1 food
      const gainNode = result!.flow.children[2] as ActionFlow
      if (gainNode.type === 'leaf') {
        expect(gainNode.actionId).toBe('gain')
        expect(gainNode.params).toEqual({ grain: 1, food: 1 })
      }
    }
  })

  it('matches via getMatchingListeners for opponent renovate', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C153_PatternMaker']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'C153-pattern-maker-opponent-renovate')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })

  it('does not match when card owner renovates', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C153_PatternMaker']
    const state = createState(p1)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'C153-pattern-maker-opponent-renovate')
    expect(found).toBeUndefined()
  })
})

// ===== D149 Casual Worker =====
describe('D149_CasualWorker', () => {
  it('registers an opponent listener on place-farmer', () => {
    const listener = findListener('D149-casual-worker-opponent-quarry')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')
  })

  it('triggers when opponent uses eastern-quarry with xor choice', () => {
    const listener = findListener('D149-casual-worker-opponent-quarry')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D149_CasualWorker']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('eastern-quarry'),
      actionId: 'place-farmer', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('xor')
    if (result!.flow?.type === 'xor') {
      expect(result!.flow.optional).toBe(true)
      expect(result!.flow.children).toHaveLength(2)

      // Option 1: gain 1 food
      const foodNode = result!.flow.children[0] as ActionFlow
      if (foodNode.type === 'leaf') {
        expect(foodNode.actionId).toBe('gain')
        expect(foodNode.params).toEqual({ food: 1 })
      }

      // Option 2: build 1 free stable
      const stableNode = result!.flow.children[1] as ActionFlow
      if (stableNode.type === 'leaf') {
        expect(stableNode.actionId).toBe('stables')
        expect(stableNode.actionContext).toEqual({ max: 1, costOverride: {} })
      }
    }
  })

  it('triggers when opponent uses western-quarry', () => {
    const listener = findListener('D149-casual-worker-opponent-quarry')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D149_CasualWorker']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('western-quarry'),
      actionId: 'place-farmer', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('xor')
  })

  it('does not trigger on non-quarry spaces', () => {
    const listener = findListener('D149-casual-worker-opponent-quarry')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D149_CasualWorker']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('forest'),
      actionId: 'place-farmer', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })

  it('matches via getMatchingListeners for opponent quarry', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D149_CasualWorker']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('eastern-quarry'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'D149-casual-worker-opponent-quarry')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })
})

// ===== C151 Sowing Director =====
describe('C151_SowingDirector', () => {
  it('registers an opponent listener on place-farmer', () => {
    const listener = findListener('C151-sowing-director-opponent-grain-utilization')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')
  })

  it('triggers when opponent uses grain-utilization with free sow', () => {
    const listener = findListener('C151-sowing-director-opponent-grain-utilization')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C151_SowingDirector']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('grain-utilization'),
      actionId: 'place-farmer', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.actionId).toBe('sow')
      expect(result!.flow.optional).toBe(true)
      expect(result!.flow.sourceCard).toBe('C151_SowingDirector')
      expect(result!.flow.actionContext).toEqual({ trueAction: false })
    }
    expect(result!.logKey).toBe('log.cardGrantedAction')
  })

  it('does not trigger on non-grain-utilization spaces', () => {
    const listener = findListener('C151-sowing-director-opponent-grain-utilization')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C151_SowingDirector']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('cultivation'),
      actionId: 'place-farmer', phase: 'after',
      ownerPlayer: p1,
    } as any)

    expect(result).toBeUndefined()
  })

  it('matches via getMatchingListeners for opponent grain-utilization', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C151_SowingDirector']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('grain-utilization'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'C151-sowing-director-opponent-grain-utilization')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })

  it('does not match when card owner uses grain-utilization', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C151_SowingDirector']
    const state = createState(p1)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('grain-utilization'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'C151-sowing-director-opponent-grain-utilization')
    expect(found).toBeUndefined()
  })
})
