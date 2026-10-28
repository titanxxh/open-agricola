import { installOfficialCardRegistry } from './card-environment'

installOfficialCardRegistry()

import { describe, expect, it } from 'vitest'
import { runCardListeners } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import { computeAnimalZones, type AnimalZone } from '../../domain/animal-zones'
import type { ActionSpace, FarmTilePosition, GameState, Pasture, PlayerState } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'

import '../E/E033_BeaverColony'

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

const makePasture = (id: string, tiles: FarmTilePosition[], animal?: { type: 'sheep' | 'boar' | 'cattle'; count: number }): Pasture => ({
  id,
  tiles,
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
    occupationHand: [], occupationPlayed: [],houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: {},
  }) as PlayerState

const createState = (player: PlayerState): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players: [player],
    actionSpaces: [], log: [],
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

const afterSpaceUse = (
  player: PlayerState,
  spaceId: string,
  actionEvents: DraftGameEvent[] = [],
  transactionEvents = actionEvents,
) => runCardListeners({
  state: createState(player), player, space: createSpace(spaceId),
  actionId: spaceId, actionSpaceUse: { newPlacement: true }, phase: 'after',
  actionEvents, transactionEvents, actionHooks: undefined,
})

const expectedBonus = [{
  flow: { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
  sourceCard: CARD_ID,
}]

describe('E033_BeaverColony pasture constraint', () => {
  it('tags every stabled pasture without changing capacities', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect?.onComputeAnimalZones).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('big', [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }]),
      makePasture('small', [{ row: 1, col: 3 }]),
      makePasture('medium', [{ row: 2, col: 0 }, { row: 2, col: 1 }]),
    ]
    player.stableTiles = [{ row: 1, col: 0 }, { row: 1, col: 3 }]

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
    player.pastures = [makePasture('p1', [{ row: 1, col: 0 }])]
    player.stableTiles = [{ row: 1, col: 0 }]
    const pastureZones = computeAnimalZones(player).filter((zone) => zone.zoneType === 'pasture')
    expect(pastureZones).toHaveLength(1)
    expect(pastureZones[0]?.capacity).toBe(4)
    expect(pastureZones[0]?.requiredEmptyZoneGroupIds).toBeUndefined()
  })

  it('does not tag unstabled pastures', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [makePasture('p1', [{ row: 1, col: 0 }, { row: 1, col: 1 }])]
    const pastureZones = computeAnimalZones(player).filter((zone) => zone.zoneType === 'pasture')
    expect(pastureZones).toHaveLength(1)
    expect(pastureZones[0]?.capacity).toBe(4)
    expect(pastureZones[0]?.requiredEmptyZoneGroupIds).toBeUndefined()
  })

  it('onBuy requests reorganization without mutating animals', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.pastures = [
      makePasture('p1', [{ row: 1, col: 0 }], { type: 'sheep', count: 2 }),
      makePasture('p2', [{ row: 1, col: 1 }], { type: 'sheep', count: 2 }),
    ]
    player.stableTiles = [{ row: 1, col: 0 }, { row: 1, col: 1 }]
    player.resources.sheep = 4
    const before = structuredClone(player)

    const flow = getCardEffect(CARD_ID)!.onBuy!(createState(player), player)

    expect(flow).toMatchObject({ type: 'leaf', actionId: 'reorganize', sourceCard: CARD_ID })
    expect(player).toEqual(before)
  })
})

// ─── Reed bonus VP ──────────────────────────────────────────────────

describe('E033_BeaverColony reed from an Action Space Use', () => {
  it.each([
    { spaceId: 'reed-bank', reed: 3 },
    { spaceId: 'resource-market-4', reed: 1 },
    { spaceId: 'resource-market-56', reed: 1 },
    { spaceId: 'riverbank-forest-56', reed: 1 },
  ])('offers one bonus point for $reed reed from $spaceId', ({ spaceId, reed }) => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const before = structuredClone(player)
    expect(afterSpaceUse(player, spaceId, [reedMoved(reed, player.id, spaceId)])).toEqual(expectedBonus)
    expect(player).toEqual(before)
  })

  it.each(['reed-bank', 'day-laborer'])('does not reward a use of %s without reed', spaceId => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const food: DraftGameEvent<'resource.moved'> = {
      type: 'resource.moved', resources: { food: 1 }, from: { kind: 'actionSpace', spaceId },
      to: { kind: 'player', playerId: player.id }, reason: 'gain',
    }
    expect(afterSpaceUse(player, spaceId, [food])).toEqual([])
  })

  it('offers only one bonus for collect and gain facts in the same space use', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    expect(afterSpaceUse(player, 'riverbank-forest-56', [
      reedMoved(1, player.id, 'riverbank-forest-56'),
      { ...reedMoved(1, player.id, 'riverbank-forest-56'), reason: 'gain' },
    ])).toEqual(expectedBonus)
  })

  it.each(['card', 'supply'] as const)('does not reward card-gift reed from %s during a space use', kind => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const gift: DraftGameEvent<'resource.moved'> = { ...reedMoved(1),
      from: kind === 'card' ? { kind, cardId: 'B009_BeatingRod' } : { kind },
      sourceCardId: 'B009_BeatingRod', reason: 'cardEffect',
    }
    expect(afterSpaceUse(player, 'meeting-place', [gift])).toEqual([])
  })

  it('does not reward reed received by another player', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    expect(afterSpaceUse(player, 'reed-bank', [reedMoved(3, 'p2')])).toEqual([])
  })

  it('does not reward a card that is only in hand', () => {
    const player = createPlayer()
    player.minorHand = [CARD_ID]
    expect(afterSpaceUse(player, 'reed-bank', [reedMoved(3)])).toEqual([])
  })

  it('does not borrow reed facts from outside the current space use', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    expect(afterSpaceUse(player, 'day-laborer', [], [reedMoved(3)])).toEqual([])
  })

  it('does not subscribe to a nested rule action within the space use', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    expect(runCardListeners({
      state: createState(player), player, space: createSpace('resource-market-4'),
      actionId: 'gain', phase: 'after',
      actionEvents: [reedMoved(1, player.id, 'resource-market-4')], actionHooks: undefined,
    })).toEqual([])
  })
})
