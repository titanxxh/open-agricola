import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'

import '../A/A110_Roughcaster'
import '../A/A126_MasterWorkman'
import type { CardListenerContext } from '../card-listeners'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: 'red',
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
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: {},
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
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

// ─── A110_Roughcaster ───────────────────────────────────────────────

describe('A110_Roughcaster', () => {
  it('gains 3 food after construct with clay house', () => {
    const listener = findListener('A110-roughcaster-after-construct')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'clay'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
      expect(result.flow.sourceCard).toBe('A110_Roughcaster')
    }
  })

  it('does not trigger construct with wood house', () => {
    const listener = findListener('A110-roughcaster-after-construct')!
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'wood'
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('does not trigger construct with stone house', () => {
    const listener = findListener('A110-roughcaster-after-construct')!
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'stone'
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('gains 3 food after clay-to-stone renovation', () => {
    const listener = findListener('A110-roughcaster-after-renovate')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'stone'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      actionEvents: [{ type: 'farm.renovated', playerId: player.id, from: 'clay', to: 'stone', rooms: 2 }],
    } as unknown as CardListenerContext)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
    }
  })

  it('does not trigger renovate with clay house', () => {
    const listener = findListener('A110-roughcaster-after-renovate')!
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'clay'
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

})

// ─── A126_MasterWorkman ─────────────────────────────────────────────

describe('A126_MasterWorkman', () => {
  const createRoundState = (player: PlayerState, spaceId: string, roundIndex: number) => {
    const state = createState(player)
    state.roundActionOrder[roundIndex] = spaceId as any
    return state
  }

  it('gives wood on round space 1 (index 0)', () => {
    const listener = findListener('A126-master-workman-before')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'sheep-market', 0)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('sheep-market'),
      actionId: 'sheep-market', phase: 'before',
    } as unknown as CardListenerContext)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ wood: 1 })
      expect(result.flow.sourceCard).toBe('A126_MasterWorkman')
    }
  })

  it('gives clay on round space 2 (index 1)', () => {
    const listener = findListener('A126-master-workman-before')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'grain-utilization', 1)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('grain-utilization'),
      actionId: 'grain-utilization', phase: 'before',
    } as unknown as CardListenerContext)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ clay: 1 })
    }
  })

  it('gives reed on round space 3 (index 2)', () => {
    const listener = findListener('A126-master-workman-before')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'fencing', 2)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('fencing'),
      actionId: 'fencing', phase: 'before',
    } as unknown as CardListenerContext)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ reed: 1 })
    }
  })

  it('gives stone on round space 4 (index 3)', () => {
    const listener = findListener('A126-master-workman-before')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'major-improvement', 3)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('major-improvement'),
      actionId: 'major-improvement', phase: 'before',
    } as unknown as CardListenerContext)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ stone: 1 })
    }
  })

  it('does not trigger on round space 5+ (index 4)', () => {
    const listener = findListener('A126-master-workman-before')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'wish-children', 4)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('wish-children'),
      actionId: 'wish-children', phase: 'before',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('does not trigger on space not in roundActionOrder', () => {
    const listener = findListener('A126-master-workman-before')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createState(player) // all null in roundActionOrder
    const result = executeCardListener(listener, {
      state, player, space: createSpace('day-laborer'),
      actionId: 'day-laborer', phase: 'before',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  // ─── isDoable before-reachability opt-in ───

  it('isDoable returns true for a round 1-4 action without previewing execution', () => {
    const listener = findListener('A126-master-workman-isdoable')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'construct', 0)
    const space = createSpace('construct', {
      canBeExecutedByPlayer: () => {
        throw new Error('preview should not run')
      },
    } as any)
    const result = executeCardListener(listener, {
      state, player, space,
      actionId: 'construct', phase: 'isDoable', doable: false,
    } as unknown as CardListenerContext)
    expect(result?.doable).toBe(true)
  })

  it('isDoable does not override when already doable', () => {
    const listener = findListener('A126-master-workman-isdoable')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'construct', 0)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'isDoable', doable: true,
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('isDoable does not re-open skipBeforeTriggers continuation', () => {
    const listener = findListener('A126-master-workman-isdoable')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'construct', 0)
    const space = createSpace('construct', {
      canBeExecutedByPlayer: () => {
        throw new Error('preview should not run')
      },
    } as any)
    const result = executeCardListener(listener, {
      state, player, space,
      actionId: 'construct', phase: 'isDoable', doable: false,
      actionContext: { skipBeforeTriggers: true },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('isDoable does not trigger for space not in round 1-4', () => {
    const listener = findListener('A126-master-workman-isdoable')!
    const player = createPlayer()
    player.occupationPlayed = ['A126_MasterWorkman']
    const state = createRoundState(player, 'wish-children', 4)
    const space = createSpace('wish-children', {
      canBeExecutedByPlayer: () => false,
    } as any)
    const result = executeCardListener(listener, {
      state, player, space,
      actionId: 'wish-children', phase: 'isDoable', doable: false,
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })
})
