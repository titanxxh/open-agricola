import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  getMatchingListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'
import { recordActionSnapshot } from '../helpers/action-snapshot'

// Import card files to register listeners
import '../A/A158_CulinaryArtist'
import '../A/A159_JoinerOfSea'
import '../A/A160_Lutenist'
import '../C/C149_ResourceRecycler'
import '../C/C152_Puppeteer'
import '../C/C167_CattleBuyer'
import '../D/D128_BuildingTycoon'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
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

// ===== A158 Culinary Artist =====
describe('A158_CulinaryArtist', () => {
  it('returns xor flow with 3 exchange options when opponent uses traveling-players', () => {
    const listener = findListener('A158-culinary-artist-opponent-traveling-players')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A158_CulinaryArtist']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('traveling-players'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('xor')
    if (result?.flow?.type === 'xor') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toHaveLength(3)
      // grain -> 4 food
      const opt1 = result.flow.children[0] as any
      expect(opt1.type).toBe('seq')
      expect(opt1.children[0].actionId).toBe('pay-resources')
      expect(opt1.children[0].params).toEqual({ grain: 1 })
      expect(opt1.children[1].actionId).toBe('gain')
      expect(opt1.children[1].params).toEqual({ food: 4 })
      // sheep -> 5 food
      const opt2 = result.flow.children[1] as any
      expect(opt2.children[0].params).toEqual({ sheep: 1 })
      expect(opt2.children[1].params).toEqual({ food: 5 })
      // vegetable -> 7 food
      const opt3 = result.flow.children[2] as any
      expect(opt3.children[0].params).toEqual({ vegetable: 1 })
      expect(opt3.children[1].params).toEqual({ food: 7 })
    }
  })

  it('does not trigger on non-traveling-players space', () => {
    const listener = findListener('A158-culinary-artist-opponent-traveling-players')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A158_CulinaryArtist']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('matches via getMatchingListeners for opponent scope', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A158_CulinaryArtist']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('traveling-players'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'A158-culinary-artist-opponent-traveling-players')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })

  it('does not match when card owner uses traveling-players', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A158_CulinaryArtist']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p1, space: createSpace('traveling-players'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'A158-culinary-artist-opponent-traveling-players')
    expect(found).toBeUndefined()
  })
})

// ===== A159 Joiner of Sea =====
describe('A159_JoinerOfSea', () => {
  it('returns seq flow giving opponent wood and gaining 2 food on fishing', () => {
    const listener = findListener('A159-joiner-of-sea-opponent-fishing-reed')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A159_JoinerOfSea']
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
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toHaveLength(3)
      // pay 1 wood
      expect((result.flow.children[0] as any).actionId).toBe('pay-resources')
      expect((result.flow.children[0] as any).params).toEqual({ wood: 1 })
      // give opponent 1 wood
      expect((result.flow.children[1] as any).actionId).toBe('gain-trigger-player')
      expect((result.flow.children[1] as any).params).toMatchObject({ wood: 1, targetPlayerId: 'p2' })
      // gain 2 food
      expect((result.flow.children[2] as any).actionId).toBe('gain')
      expect((result.flow.children[2] as any).params).toEqual({ food: 2 })
    }
  })

  it('returns 3 food gain on reed-bank', () => {
    const listener = findListener('A159-joiner-of-sea-opponent-fishing-reed')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A159_JoinerOfSea']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('reed-bank'),
      actionId: 'place-farmer', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow).toBeDefined()
    if (result?.flow?.type === 'seq') {
      // gain 3 food on reed-bank
      expect((result.flow.children[2] as any).params).toEqual({ food: 3 })
    }
  })

  it('does not trigger on non-fishing/reed-bank space', () => {
    const listener = findListener('A159-joiner-of-sea-opponent-fishing-reed')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A159_JoinerOfSea']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('traveling-players'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== A160 Lutenist =====
describe('A160_Lutenist', () => {
  it('returns seq flow with automatic gain then optional pay for vegetable', () => {
    const listener = findListener('A160-lutenist-opponent-traveling-players')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A160_Lutenist']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('traveling-players'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      // Automatic: gain 1 food + 1 wood
      const autoGain = result.flow.children[0] as any
      expect(autoGain.actionId).toBe('gain')
      expect(autoGain.params).toEqual({ food: 1, wood: 1 })
      // Optional: pay 2 food -> get 1 vegetable
      const optionalSeq = result.flow.children[1] as any
      expect(optionalSeq.type).toBe('seq')
      expect(optionalSeq.optional).toBe(true)
      expect(optionalSeq.children).toHaveLength(2)
      expect(optionalSeq.children[0].actionId).toBe('pay-resources')
      expect(optionalSeq.children[0].params).toEqual({ food: 2 })
      expect(optionalSeq.children[1].actionId).toBe('gain')
      expect(optionalSeq.children[1].params).toEqual({ vegetable: 1 })
    }
  })

  it('does not trigger on non-traveling-players space', () => {
    const listener = findListener('A160-lutenist-opponent-traveling-players')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['A160_Lutenist']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== C149 Resource Recycler =====
describe('C149_ResourceRecycler', () => {
  it('returns flow to pay 2 food and build 1 room free when opponent renovates to stone and owner has clay house', () => {
    const listener = findListener('C149-resource-recycler-opponent-renovate-stone')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C149_ResourceRecycler']
    p1.houseType = 'clay'
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'stone' // just renovated to stone
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      triggerPlayer: p2,
      ownerPlayer: p1,
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toHaveLength(2)
      // pay 2 food
      expect((result.flow.children[0] as any).actionId).toBe('pay-resources')
      expect((result.flow.children[0] as any).params).toEqual({ food: 2 })
      // build 1 room free
      expect((result.flow.children[1] as any).actionId).toBe('construct')
      expect((result.flow.children[1] as any).actionContext?.maxRooms).toBe(1)
    }
  })

  it('does not trigger when opponent renovates to clay (not stone)', () => {
    const listener = findListener('C149-resource-recycler-opponent-renovate-stone')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C149_ResourceRecycler']
    p1.houseType = 'clay'
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'clay' // renovated to clay, not stone
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      triggerPlayer: p2,
      ownerPlayer: p1,
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when owner does not have clay house', () => {
    const listener = findListener('C149-resource-recycler-opponent-renovate-stone')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C149_ResourceRecycler']
    p1.houseType = 'wood' // not clay
    const p2 = createPlayer('p2', 'P2')
    p2.houseType = 'stone'
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      triggerPlayer: p2,
      ownerPlayer: p1,
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== C152 Puppeteer =====
describe('C152_Puppeteer', () => {
  it('returns flow to pay opponent 1 food and play occupation for free', () => {
    const listener = findListener('C152-puppeteer-opponent-traveling-players')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C152_Puppeteer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('traveling-players'),
      actionId: 'place-farmer', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toHaveLength(3)
      // pay 1 food
      expect((result.flow.children[0] as any).actionId).toBe('pay-resources')
      expect((result.flow.children[0] as any).params).toEqual({ food: 1 })
      // give opponent 1 food
      expect((result.flow.children[1] as any).actionId).toBe('gain-trigger-player')
      expect((result.flow.children[1] as any).params).toMatchObject({ food: 1, targetPlayerId: 'p2' })
      // play occupation for free
      expect((result.flow.children[2] as any).actionId).toBe('play-occupation')
      expect((result.flow.children[2] as any).params).toEqual({ costOverride: {} })
    }
  })

  it('does not trigger on non-traveling-players space', () => {
    const listener = findListener('C152-puppeteer-opponent-traveling-players')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C152_Puppeteer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('fishing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== C167 Cattle Buyer =====
describe('C167_CattleBuyer', () => {
  it('returns xor flow with 3 animal purchase options when opponent uses fencing', () => {
    const listener = findListener('C167-cattle-buyer-opponent-fencing')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C167_CattleBuyer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('fencing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('xor')
    if (result?.flow?.type === 'xor') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toHaveLength(3)
      // 1 sheep for 1 food
      const opt1 = result.flow.children[0] as any
      expect(opt1.type).toBe('seq')
      expect(opt1.children[0].actionId).toBe('pay-resources')
      expect(opt1.children[0].params).toEqual({ food: 1 })
      expect(opt1.children[1].actionId).toBe('gain')
      expect(opt1.children[1].params).toEqual({ sheep: 1 })
      // 1 pig for 2 food
      const opt2 = result.flow.children[1] as any
      expect(opt2.children[0].params).toEqual({ food: 2 })
      expect(opt2.children[1].params).toEqual({ boar: 1 })
      // 1 cattle for 2 food
      const opt3 = result.flow.children[2] as any
      expect(opt3.children[0].params).toEqual({ food: 2 })
      expect(opt3.children[1].params).toEqual({ cattle: 1 })
    }
  })

  it('does not trigger on non-fencing space', () => {
    const listener = findListener('C167-cattle-buyer-opponent-fencing')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C167_CattleBuyer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const result = executeCardListener(listener, {
      state, player: p2, space: createSpace('traveling-players'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('matches via getMatchingListeners for opponent scope', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['C167_CattleBuyer']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('fencing'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'C167-cattle-buyer-opponent-fencing')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })
})

// ===== D128 Building Tycoon =====
describe('D128_BuildingTycoon', () => {
  it('returns flow to pay opponent 1 food and build 1 room when opponent builds rooms', () => {
    const listener = findListener('D128-building-tycoon-opponent-construct')
    expect(listener).toBeDefined()
    expect(listener!.scope).toBe('opponent')

    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D128_BuildingTycoon']
    const p2 = createPlayer('p2', 'P2')
    // Simulate opponent built a room: record snapshot before, then add room tile
    recordActionSnapshot(p2, 1)
    p2.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] as any
    p2.rooms = 3
    const state = createState(p1, p2)

    const result = executeCardListener(listener!, {
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toHaveLength(3)
      // pay 1 food
      expect((result.flow.children[0] as any).actionId).toBe('pay-resources')
      expect((result.flow.children[0] as any).params).toEqual({ food: 1 })
      // give opponent 1 food
      expect((result.flow.children[1] as any).actionId).toBe('gain-trigger-player')
      expect((result.flow.children[1] as any).params).toMatchObject({ food: 1, targetPlayerId: 'p2' })
      // build 1 room at full cost
      expect((result.flow.children[2] as any).actionId).toBe('construct')
      expect((result.flow.children[2] as any).actionContext?.maxRooms).toBe(1)
    }
  })

  it('does not trigger when opponent built 0 rooms (snapshot matches)', () => {
    const listener = findListener('D128-building-tycoon-opponent-construct')!
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D128_BuildingTycoon']
    const p2 = createPlayer('p2', 'P2')
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

  it('matches via getMatchingListeners for opponent scope', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.occupationPlayed = ['D128_BuildingTycoon']
    const p2 = createPlayer('p2', 'P2')
    const state = createState(p1, p2)

    const matched = getMatchingListeners({
      state, player: p2, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as any)
    const found = matched.find(m => m.registration.id === 'D128-building-tycoon-opponent-construct')
    expect(found).toBeDefined()
    expect(found!.ownerPlayerId).toBe('p1')
  })
})
