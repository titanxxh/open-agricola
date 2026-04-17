import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  getMatchingListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'
import { recordActionSnapshot } from '../helpers/action-snapshot'

// Import card files to register listeners
import '../B/B143_ClayWarden'
import '../B/B159_LieutenantGeneral'
import '../C/C137_CharcoalBurner'
import '../D/D77_RecycledBrick'
import '../D/D160_Midwife'
import '../E/E49_Twibil'
import '../E/E156_ClaypitOwner'
import '../E/E160_KelpGatherer'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
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

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

// ===== B143 Clay Warden =====
describe('B143_ClayWarden', () => {
  it('owner gains 1 clay when opponent uses hollow-4', () => {
    const listener = findListener('B143-clay-warden-opponent-hollow')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B143_ClayWarden']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('hollow-4'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ clay: 1 })
    }
  })

  it('does not trigger on non-hollow spaces', () => {
    const listener = findListener('B143-clay-warden-opponent-hollow')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B143_ClayWarden']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('clay-pit'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when owner uses hollow-4 (opponent scope)', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B143_ClayWarden']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('hollow-4'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'B143-clay-warden-opponent-hollow')
    expect(found).toBeUndefined()
  })

  it('matches via getMatchingListeners for opponent scope', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B143_ClayWarden']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('hollow-4'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'B143-clay-warden-opponent-hollow')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })
})

// ===== B159 Lieutenant General =====
describe('B159_LieutenantGeneral', () => {
  it('owner gains 1 food when opponent plows adjacent field (2+ fields after plow)', () => {
    const listener = findListener('B159-lieutenant-general-opponent-plow')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B159_LieutenantGeneral']
    const p2 = createPlayer('p2', 'P2')
    // Opponent has 2 fields after plowing (meaning new field was adjacent to existing)
    p2.fields = [
      { crop: null, remaining: 0, row: 1, col: 0 },
      { crop: null, remaining: 0, row: 1, col: 1 },
    ] as any
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ food: 1 })
    }
  })

  it('does not trigger when opponent plows first field (1 field total)', () => {
    const listener = findListener('B159-lieutenant-general-opponent-plow')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B159_LieutenantGeneral']
    const p2 = createPlayer('p2', 'P2')
    // Opponent only has 1 field — this was their first plow, not adjacent to anything
    p2.fields = [{ crop: null, remaining: 0, row: 1, col: 0 }] as any
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when owner plows (opponent scope)', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B159_LieutenantGeneral']
    p1.fields = [
      { crop: null, remaining: 0, row: 1, col: 0 },
      { crop: null, remaining: 0, row: 1, col: 1 },
    ] as any
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'B159-lieutenant-general-opponent-plow')
    expect(found).toBeUndefined()
  })

  it('pays 1 grain instead of 1 food in round 14', () => {
    const listener = findListener('B159-lieutenant-general-opponent-plow')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['B159_LieutenantGeneral']
    const p2 = createPlayer('p2', 'P2')
    p2.fields = [
      { crop: null, remaining: 0, row: 1, col: 0 },
      { crop: null, remaining: 0, row: 1, col: 1 },
    ] as any
    const state = createState(p1, p2)
    state.round = 14

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('plow'),
      actionId: 'plow', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ grain: 1 })
    }
  })
})

// ===== C137 Charcoal Burner =====
describe('C137_CharcoalBurner', () => {
  it('owner gains 1 wood + 1 food when any player builds baking improvement', () => {
    const listener = findListener('C137-charcoal-burner-any-bake-improvement')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('any')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C137_CharcoalBurner']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    // Major_Fireplace1 has isBaking = true
    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'major:Major_Fireplace1',
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ wood: 1, food: 1 })
    }
  })

  it('triggers when owner builds a baking improvement (scope any)', () => {
    const listener = findListener('C137-charcoal-burner-any-bake-improvement')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C137_CharcoalBurner']
    const state = createState(p1)

    const result = executeCardListener(listener, {
      state, player: p1, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'major:Major_ClayOven',
    } as any)
    expect(result?.flow).toBeDefined()
  })

  it('does not trigger when improvement has no bake capability', () => {
    const listener = findListener('C137-charcoal-burner-any-bake-improvement')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C137_CharcoalBurner']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    // Major_Well has no baking capability
    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'major:Major_Well',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger with no choice', () => {
    const listener = findListener('C137-charcoal-burner-any-bake-improvement')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C137_CharcoalBurner']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== D77 Recycled Brick =====
describe('D77_RecycledBrick', () => {
  it('owner gains clay equal to rooms when any player renovates to stone', () => {
    const listener = findListener('D77-recycled-brick-any-renovate-stone')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('any')

    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['D77_RecycledBrick']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'stone'
    p2.rooms = 3
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ clay: 3 })
    }
  })

  it('gives 2 clay for 2 rooms', () => {
    const listener = findListener('D77-recycled-brick-any-renovate-stone')!
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['D77_RecycledBrick']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'stone'
    p2.rooms = 2
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow).toBeDefined()
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ clay: 2 })
    }
  })

  it('does not trigger when renovating to clay (not stone)', () => {
    const listener = findListener('D77-recycled-brick-any-renovate-stone')!
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['D77_RecycledBrick']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'clay'
    p2.rooms = 2
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result).toBeUndefined()
  })

  it('triggers when owner renovates to stone (scope any)', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['D77_RecycledBrick']
    p1.houseType = 'stone'
    p1.rooms = 2
    const state = createState(p1)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'D77-recycled-brick-any-renovate-stone')
    expect(found).toBeDefined()
  })
})

// ===== D160 Midwife =====
describe('D160_Midwife', () => {
  it('owner gains 1 grain when opponent uses wish-children', () => {
    const listener = findListener('D160-midwife-opponent-family-growth')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D160_Midwife']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('wish-children'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ grain: 1 })
    }
  })

  it('triggers on urgent-wish-children as well', () => {
    const listener = findListener('D160-midwife-opponent-family-growth')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D160_Midwife']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('urgent-wish-children'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
  })

  it('does not trigger on non-family-growth spaces', () => {
    const listener = findListener('D160-midwife-opponent-family-growth')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D160_Midwife']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('day-laborer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when owner uses wish-children (opponent scope)', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D160_Midwife']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('wish-children'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'D160-midwife-opponent-family-growth')
    expect(found).toBeUndefined()
  })
})

// ===== E49 Twibil =====
describe('E49_Twibil', () => {
  it('owner gains 1 food when any player builds wood rooms', () => {
    const listener = findListener('E49-twibil-any-construct-wood-room')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('any')

    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['E49_Twibil']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'wood'
    // Simulate building 1 room
    recordActionSnapshot(p2, 1)
    p2.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] as any
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ food: 1 })
    }
  })

  it('does not trigger when rooms are clay', () => {
    const listener = findListener('E49-twibil-any-construct-wood-room')!
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['E49_Twibil']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'clay'
    recordActionSnapshot(p2, 1)
    p2.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] as any
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when no rooms were built', () => {
    const listener = findListener('E49-twibil-any-construct-wood-room')!
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['E49_Twibil']
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'wood'
    // Record snapshot with same room count (no rooms built)
    p2.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }] as any
    recordActionSnapshot(p2, 1)
    // roomTiles unchanged
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result).toBeUndefined()
  })

  it('triggers when owner builds wood rooms (scope any)', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['E49_Twibil']
    p1.houseType = 'wood'
    const state = createState(p1)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'E49-twibil-any-construct-wood-room')
    expect(found).toBeDefined()
  })
})

// ===== E156 Claypit Owner =====
describe('E156_ClaypitOwner', () => {
  it('owner gains 1 food + 1 clay when opponent plays improvement with clay cost', () => {
    const listener = findListener('E156-claypit-owner-opponent-improvement-clay')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E156_ClaypitOwner']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    // Major_Fireplace1 costs { clay: 2 }
    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'major:Major_Fireplace1',
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ food: 1, clay: 1 })
    }
  })

  it('triggers for clay oven (clay cost)', () => {
    const listener = findListener('E156-claypit-owner-opponent-improvement-clay')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E156_ClaypitOwner']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    // Major_ClayOven costs { clay: 3, stone: 1 }
    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'major:Major_ClayOven',
    } as any)
    expect(result?.flow).toBeDefined()
  })

  it('does not trigger for improvement without clay cost', () => {
    const listener = findListener('E156-claypit-owner-opponent-improvement-clay')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E156_ClaypitOwner']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    // Major_Well costs { wood: 1, stone: 3 } — no clay
    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
      choice: 'major:Major_Well',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when owner plays improvement (opponent scope)', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E156_ClaypitOwner']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'E156-claypit-owner-opponent-improvement-clay')
    expect(found).toBeUndefined()
  })
})

// ===== E160 Kelp Gatherer =====
describe('E160_KelpGatherer', () => {
  it('opponent gets 1 extra food and owner gets 1 vegetable on fishing', () => {
    const listener = findListener('E160-kelp-gatherer-opponent-fishing')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E160_KelpGatherer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.children).toHaveLength(2)
      // Opponent gets 1 extra food
      expect((result.flow.children[0] as any).actionId).toBe('gain-trigger-player')
      expect((result.flow.children[0] as any).params).toMatchObject({ food: 1, targetPlayerId: 'p2' })
      // Owner gets 1 vegetable
      expect((result.flow.children[1] as any).actionId).toBe('gain')
      expect((result.flow.children[1] as any).params).toEqual({ vegetable: 1 })
    }
  })

  it('does not trigger on non-fishing spaces', () => {
    const listener = findListener('E160-kelp-gatherer-opponent-fishing')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E160_KelpGatherer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('day-laborer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when owner uses fishing (opponent scope)', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E160_KelpGatherer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'E160-kelp-gatherer-opponent-fishing')
    expect(found).toBeUndefined()
  })

  it('matches via getMatchingListeners for opponent scope', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['E160_KelpGatherer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'E160-kelp-gatherer-opponent-fishing')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })
})
