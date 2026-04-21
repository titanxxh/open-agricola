import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import {
  computeAnimalZones,
  getTotalAnimalCapacity,
  enforceAnimalCapacity,
} from '../../actions/effects/animals'
import type { ActionSpace, GameState, Pasture, PlayerState } from '../../game/types'

import '../E/E33_BeaverColony'
import type { CardListenerContext } from '../card-listeners'

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
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
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
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

// ─── Pasture blocking ───────────────────────────────────────────────

describe('E33_BeaverColony pasture blocking', () => {
  it('exposes pasture blocking through onComputeAnimalZones', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect?.onComputeAnimalZones).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('big', 3, 1),
      makePasture('small', 1, 1),
      makePasture('medium', 2, 0),
    ]

    const zones = [
      { id: 'big', zoneType: 'pasture' as const, capacity: 12, animalType: null, animalCount: 0, pastureIndex: 0 },
      { id: 'small', zoneType: 'pasture' as const, capacity: 4, animalType: null, animalCount: 0, pastureIndex: 1 },
      { id: 'medium', zoneType: 'pasture' as const, capacity: 4, animalType: null, animalCount: 0, pastureIndex: 2 },
    ]

    effect!.onComputeAnimalZones!(player, zones)

    expect(zones.map((zone) => [zone.id, zone.capacity])).toEqual([
      ['big', 12],
      ['small', 0],
      ['medium', 4],
    ])
  })

  it('computeAnimalZones keeps normal pasture capacity when card not played', () => {
    const player = createPlayer()
    player.pastures = [makePasture('p1', 1, 1)]
    const pastureZones = computeAnimalZones(player).filter((zone) => zone.zoneType === 'pasture')
    expect(pastureZones).toHaveLength(1)
    expect(pastureZones[0]?.capacity).toBe(4)
  })

  it('computeAnimalZones keeps normal capacity when no stabled pastures exist', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [makePasture('p1', 2, 0)]
    const pastureZones = computeAnimalZones(player).filter((zone) => zone.zoneType === 'pasture')
    expect(pastureZones).toHaveLength(1)
    expect(pastureZones[0]?.capacity).toBe(4)
  })

  it('computeAnimalZones blocks the smallest stabled pasture', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('big', 3, 1),   // capacity: 3*2*2 = 12
      makePasture('small', 1, 1), // capacity: 1*2*2 = 4
      makePasture('medium', 2, 0), // no stable, ignored
    ]
    const pastureZones = computeAnimalZones(player).filter((zone) => zone.zoneType === 'pasture')
    expect(pastureZones.map((zone) => [zone.id, zone.capacity])).toEqual([
      ['big', 12],
      ['small', 0],
      ['medium', 4],
    ])
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
    } as unknown as CardListenerContext)
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
    } as unknown as CardListenerContext)
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
    } as unknown as CardListenerContext)
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
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })
})
