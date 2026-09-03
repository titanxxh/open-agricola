import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import { computeAnimalZones, type AnimalZone } from '../../domain/animal-zones'
import type { ActionSpace, GameState, Pasture, PlayerState } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'

import '../E/E033_BeaverColony'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'E033_BeaverColony'

const reedMoved = (
  reed: number,
  playerId = 'p1',
  spaceId = 'reed-bank',
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { reed },
  from: { kind: 'actionSpace', spaceId },
  to: { kind: 'player', playerId },
  reason: 'collect',
})

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

describe('E033_BeaverColony pasture constraint', () => {
  it('tags every stabled pasture without changing capacities', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect?.onComputeAnimalZones).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('big', 3, 1),
      makePasture('small', 1, 1),
      makePasture('medium', 2, 0),
    ]

    const zones: AnimalZone[] = [
      { id: 'big', zoneType: 'pasture' as const, capacity: 12, animalType: null, animalCount: 0, pastureIndex: 0 },
      { id: 'small', zoneType: 'pasture' as const, capacity: 4, animalType: null, animalCount: 0, pastureIndex: 1 },
      { id: 'medium', zoneType: 'pasture' as const, capacity: 4, animalType: null, animalCount: 0, pastureIndex: 2 },
    ]

    effect!.onComputeAnimalZones!(player, zones)

    expect(zones.map((zone) => [zone.id, zone.capacity])).toEqual([
      ['big', 12],
      ['small', 4],
      ['medium', 4],
    ])
    const groupId = zones[0]!.requiredEmptyZoneGroupIds?.[0]
    expect(groupId).toBeTypeOf('string')
    expect(zones[1]!.requiredEmptyZoneGroupIds).toContain(groupId)
    expect(zones[2]!.requiredEmptyZoneGroupIds).toBeUndefined()
  })

  it('does not tag pastures when the card is not played', () => {
    const player = createPlayer()
    player.pastures = [makePasture('p1', 1, 1)]
    const pastureZones = computeAnimalZones(player).filter((zone) => zone.zoneType === 'pasture')
    expect(pastureZones).toHaveLength(1)
    expect(pastureZones[0]?.capacity).toBe(4)
    expect(pastureZones[0]?.requiredEmptyZoneGroupIds).toBeUndefined()
  })

  it('does not tag unstabled pastures', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [makePasture('p1', 2, 0)]
    const pastureZones = computeAnimalZones(player).filter((zone) => zone.zoneType === 'pasture')
    expect(pastureZones).toHaveLength(1)
    expect(pastureZones[0]?.capacity).toBe(4)
    expect(pastureZones[0]?.requiredEmptyZoneGroupIds).toBeUndefined()
  })

  it('onBuy requests reorganization without mutating animals', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('p1', 1, 1, { type: 'sheep', count: 2 }),
      makePasture('p2', 1, 1, { type: 'sheep', count: 2 }),
    ]
    player.resources.sheep = 4
    const before = structuredClone(player)

    const flow = getCardEffect(CARD_ID)!.onBuy!(createState(player), player)

    expect(flow).toMatchObject({ type: 'leaf', actionId: 'reorganize', sourceCard: CARD_ID })
    expect(player).toEqual(before)
  })
})

// ─── Reed bonus VP ──────────────────────────────────────────────────

describe('E033_BeaverColony reed bonus VP', () => {
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
      transactionEvents: [reedMoved(2, player.id)],
      actionEvents: [reedMoved(2, player.id)],
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
      transactionEvents: [reedMoved(1, player.id, 'resource-market-4')],
      actionEvents: [reedMoved(1, player.id, 'resource-market-4')],
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
