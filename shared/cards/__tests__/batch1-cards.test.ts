import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearCardListeners,
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace, ActionExecutionResult } from '../../game/types'
import { clearActionHooks } from '../../actions/hooks'
import { getCardEffect } from '../card-effects'
import { recordActionSnapshot } from '../helpers/action-snapshot'

import '../A/A105_BarrowPusher'
import '../A/A110_Roughcaster'
import '../A/A74_StableTree'
import '../A/A79_GardenHoe'
import '../A/A55_JunkRoom'
import '../A/A109_SmallTrader'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
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

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('A105_BarrowPusher', () => {
  it('returns gain flow with clay+food after plow', () => {
    const listener = findListener('A105-barrow-pusher-after-plow')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A105_BarrowPusher']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ clay: 1, food: 1 })
      expect(result.flow.sourceCard).toBe('A105_BarrowPusher')
    }
    expect(result?.logKey).toBe('log.cardEffectGain')
  })

  it('does not match on non-plow action', () => {
    const listener = findListener('A105-barrow-pusher-after-plow')
    expect(listener).toBeDefined()
    expect(listener!.actions).toEqual(['plow'])
  })

  it('does not trigger when card not played', () => {
    const listener = findListener('A105-barrow-pusher-after-plow')
    const player = createPlayer()
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

describe('A110_Roughcaster', () => {
  it('returns gain flow after construct with clay house', () => {
    const listener = findListener('A110-roughcaster-after-construct')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'clay'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
      expect(result.flow.sourceCard).toBe('A110_Roughcaster')
    }
  })

  it('does not trigger with wood house', () => {
    const listener = findListener('A110-roughcaster-after-construct')
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'wood'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('returns gain flow after renovate to stone', () => {
    const listener = findListener('A110-roughcaster-after-renovate')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'stone'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
    }
  })
})

describe('A74_StableTree', () => {
  it('queues future meeples after building stables', () => {
    const listener = findListener('A74-stable-tree-after-stables')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A74_StableTree']
    const state = createState(player)
    state.round = 5
    recordActionSnapshot(player, 1)
    player.stableTiles = [{ row: 0, col: 0 }] as any
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('stables'),
      actionId: 'stables', phase: 'after',
    } as any)
    expect(result).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('future-meeples')
    }
    expect(state.pendingFutureMeeples.length).toBe(1)
    expect(state.pendingFutureMeeples[0].startRound).toBe(6)
    expect(state.pendingFutureMeeples[0].count).toBe(3)
    expect(state.pendingFutureMeeples[0].resources).toEqual({ wood: 1 })
  })

  it('does not trigger twice in same action', () => {
    const listener = findListener('A74-stable-tree-after-stables')
    const player = createPlayer()
    player.minorPlayed = ['A74_StableTree']
    const state = createState(player)
    state.round = 5
    recordActionSnapshot(player, 1)
    player.stableTiles = [{ row: 0, col: 0 }] as any
    const ctx = { state, player, space: createSpace('stables'), actionId: 'stables', phase: 'after' } as any
    executeCardListener(listener!, ctx)
    const result2 = executeCardListener(listener!, ctx)
    expect(result2).toBeUndefined()
  })

  it('can trigger again on a later action in the same round', () => {
    const listener = findListener('A74-stable-tree-after-stables')
    const player = createPlayer()
    player.minorPlayed = ['A74_StableTree']
    const state = createState(player)
    state.round = 5

    recordActionSnapshot(player, 1)
    player.stableTiles = [{ row: 0, col: 0 }] as any
    executeCardListener(listener!, {
      state, player, space: createSpace('stables'), actionId: 'stables', phase: 'after',
    } as any)

    recordActionSnapshot(player, 2)
    player.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }] as any
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('stables'), actionId: 'stables', phase: 'after',
    } as any)

    expect(result?.flow?.type).toBe('leaf')
    expect(state.pendingFutureMeeples.length).toBe(2)
  })

  it('triggers on buy when stables were already built this action', () => {
    const effect = getCardEffect('A74_StableTree')
    expect(effect?.onBuy).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    state.round = 5
    recordActionSnapshot(player, 3)
    player.stableTiles = [{ row: 0, col: 0 }] as any

    const flow = effect?.onBuy?.(state, player)
    expect(flow).toMatchObject({ type: 'leaf', actionId: 'future-meeples' })
    expect(state.pendingFutureMeeples.length).toBe(1)
  })
})

describe('A79_GardenHoe', () => {
  it('returns gain flow when player has vegetable field', () => {
    const listener = findListener('A79-garden-hoe-after-sow')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A79_GardenHoe']
    player.fields = [{ x: 0, y: 0, crop: 'vegetable', amount: 2 }]
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('sow'),
      actionId: 'sow', phase: 'after',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ clay: 1, stone: 1 })
      expect(result.flow.sourceCard).toBe('A79_GardenHoe')
    }
  })

  it('does not trigger with only grain fields', () => {
    const listener = findListener('A79-garden-hoe-after-sow')
    const player = createPlayer()
    player.minorPlayed = ['A79_GardenHoe']
    player.fields = [{ x: 0, y: 0, crop: 'grain', amount: 3 }]
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('sow'),
      actionId: 'sow', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

describe('A55_JunkRoom', () => {
  it('returns gain flow during improvement-any', () => {
    const listener = findListener('A55-junk-room-during-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A55_JunkRoom']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'during',
      result: { type: 'ok' } as ActionExecutionResult,
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 1 })
      expect(result.flow.sourceCard).toBe('A55_JunkRoom')
    }
  })

  it('does not match on plow action', () => {
    const listener = findListener('A55-junk-room-during-improvement')
    expect(listener).toBeDefined()
    expect(listener!.actions).toBeDefined()
    expect(listener!.actions).not.toContain('plow')
  })
})

describe('A109_SmallTrader', () => {
  it('returns gain flow when playing minor from improvement-any', () => {
    const listener = findListener('A109-small-trader-after-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A109_SmallTrader']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'minor:A55_JunkRoom',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
      expect(result.flow.sourceCard).toBe('A109_SmallTrader')
    }
  })

  it('does not trigger when playing major improvement', () => {
    const listener = findListener('A109-small-trader-after-improvement')
    const player = createPlayer()
    player.occupationPlayed = ['A109_SmallTrader']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'major:Major_Fireplace1',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger without choice', () => {
    const listener = findListener('A109-small-trader-after-improvement')
    const player = createPlayer()
    player.occupationPlayed = ['A109_SmallTrader']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})
