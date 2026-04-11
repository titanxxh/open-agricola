import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import {
  getPastureCapacity,
  getBlockedPastureId,
  getTotalAnimalCapacity,
  enforceAnimalCapacity,
} from '../../actions/effects/animals'
import type { ActionSpace, GameState, Pasture, PlayerState } from '../../game/types'

import '../E/E33_BeaverColony'

const CARD_ID = 'E33_BeaverColony'

const makePasture = (id: string, size: number, stables: number, animal?: { type: 'sheep' | 'boar' | 'cattle'; count: number }): Pasture => ({
  id,
  size,
  tiles: [],
  stables,
  animalType: animal?.type ?? null,
  animalCount: animal?.count ?? 0,
})

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: {},
  }) as PlayerState

const createState = (player: PlayerState): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players: [player],
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

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

// ─── Pasture blocking ───────────────────────────────────────────────

describe('E33_BeaverColony pasture blocking', () => {
  it('getBlockedPastureId returns undefined when card not played', () => {
    const player = createPlayer()
    player.pastures = [makePasture('p1', 1, 1)]
    expect(getBlockedPastureId(player)).toBeUndefined()
  })

  it('getBlockedPastureId returns undefined when no stabled pastures', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [makePasture('p1', 2, 0)]
    expect(getBlockedPastureId(player)).toBeUndefined()
  })

  it('getBlockedPastureId returns the smallest stabled pasture', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('big', 3, 1),   // capacity: 3*2*2 = 12
      makePasture('small', 1, 1), // capacity: 1*2*2 = 4
      makePasture('medium', 2, 0), // no stable, ignored
    ]
    expect(getBlockedPastureId(player)).toBe('small')
  })

  it('getPastureCapacity returns 0 for blocked pasture', () => {
    const pasture = makePasture('p1', 2, 1) // normal capacity: 2*2*2 = 8
    expect(getPastureCapacity(pasture)).toBe(8)
    expect(getPastureCapacity(pasture, 'p1')).toBe(0)
    expect(getPastureCapacity(pasture, 'other')).toBe(8)
  })

  it('getTotalAnimalCapacity deducts blocked pasture', () => {
    const player = createPlayer()
    player.pastures = [
      makePasture('p1', 1, 1), // 4
      makePasture('p2', 2, 0), // 4
    ]
    // Without E33: 4 + 4 + 1 (house) = 9
    expect(getTotalAnimalCapacity(player)).toBe(9)

    player.minorPlayed = [CARD_ID]
    // With E33: p1 blocked (0) + p2 (4) + 1 (house) = 5
    expect(getTotalAnimalCapacity(player)).toBe(5)
  })

  it('enforceAnimalCapacity evicts animals from blocked pasture', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('p1', 1, 1, { type: 'sheep', count: 3 }),
      makePasture('p2', 2, 0),
    ]
    player.resources.sheep = 3

    enforceAnimalCapacity(player)

    // p1 is blocked (smallest stabled) → capacity 0 → sheep evicted
    const p1 = player.pastures.find((p) => p.id === 'p1')!
    expect(p1.animalCount).toBe(0)

    // sheep should be redistributed to p2 (capacity 4)
    const p2 = player.pastures.find((p) => p.id === 'p2')!
    expect(p2.animalType).toBe('sheep')
    expect(p2.animalCount).toBe(3)
  })

  it('onBuy triggers enforceAnimalCapacity', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect?.onBuy).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('p1', 1, 1, { type: 'sheep', count: 4 }),
      makePasture('p2', 1, 0),
    ]
    player.resources.sheep = 4

    effect!.onBuy!(createState(player), player)

    // p1 blocked → sheep evicted to p2 (capacity 2) + house (1) = 3 kept
    const p1 = player.pastures.find((p) => p.id === 'p1')!
    expect(p1.animalCount).toBe(0)
    expect(player.resources.sheep).toBe(3)
  })
})

// ─── Reed bonus VP ──────────────────────────────────────────────────

describe('E33_BeaverColony reed bonus VP', () => {
  it('gives bonus VP after collecting reed from reed-bank', () => {
    const listener = findListener('E33-beaver-colony-after-collect')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const result = executeCardListener(listener, {
      state: createState(player), player,
      space: createSpace('reed-bank'),
      actionId: 'collect', phase: 'immediatelyAfter',
      result: { type: 'ok', resourcesGained: { reed: 2 } },
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('bonus-vp')
    }
  })

  it('does not trigger when no reed gained', () => {
    const listener = findListener('E33-beaver-colony-after-collect')!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const result = executeCardListener(listener, {
      state: createState(player), player,
      space: createSpace('reed-bank'),
      actionId: 'collect', phase: 'immediatelyAfter',
      result: { type: 'ok', resourcesGained: { wood: 3 } },
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when card not played', () => {
    const listener = findListener('E33-beaver-colony-after-collect')!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player,
      space: createSpace('reed-bank'),
      actionId: 'collect', phase: 'immediatelyAfter',
      result: { type: 'ok', resourcesGained: { reed: 1 } },
    } as any)
    expect(result).toBeUndefined()
  })

  it('gives bonus VP after gain on resource-market-4', () => {
    const listener = findListener('E33-beaver-colony-after-gain')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const result = executeCardListener(listener, {
      state: createState(player), player,
      space: createSpace('resource-market-4'),
      actionId: 'gain', phase: 'immediatelyAfter',
      result: { type: 'ok', resourcesGained: { reed: 1, stone: 1, food: 1 } },
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('bonus-vp')
    }
  })

  it('does not trigger gain on non-reed action space', () => {
    const listener = findListener('E33-beaver-colony-after-gain')!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const result = executeCardListener(listener, {
      state: createState(player), player,
      space: createSpace('day-laborer'),
      actionId: 'gain', phase: 'immediatelyAfter',
      result: { type: 'ok', resourcesGained: { food: 1 } },
    } as any)
    expect(result).toBeUndefined()
  })
})
