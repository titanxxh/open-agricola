import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../A/A134_FullFarmer'
import '../B/B39_Loom'
import '../D/D38_MilkingStool'
import '../D/D154_ChimneySweep'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
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
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

// ===== A134 Full Farmer =====
describe('A134_FullFarmer onBuy', () => {
  it('grants 1 wood + 1 clay when played', () => {
    const effect = getCardEffect('A134_FullFarmer')!
    const player = createPlayer()
    const state = createState(player)
    const flow = effect.onBuy!(state, player)
    expect(flow?.type).toBe('leaf')
    if (flow?.type === 'leaf') {
      expect(flow.actionId).toBe('gain')
      expect(flow.params).toEqual({ wood: 1, clay: 1 })
    }
  })
})

// ===== B39 Loom =====
describe('B39_Loom onHarvestFieldPhase', () => {
  const CARD_ID = 'B39_Loom'
  it('gives 1 food when owner has 1-3 sheep', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.sheep = 3
    const flow = effect.onHarvestFieldPhase!(createState(player), player) as any
    expect(flow?.params).toEqual({ food: 1 })
  })
  it('gives 2 food when owner has 4-6 sheep', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.sheep = 6
    const flow = effect.onHarvestFieldPhase!(createState(player), player) as any
    expect(flow?.params).toEqual({ food: 2 })
  })
  it('gives 3 food when owner has 7+ sheep', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.sheep = 10
    const flow = effect.onHarvestFieldPhase!(createState(player), player) as any
    expect(flow?.params).toEqual({ food: 3 })
  })
  it('gives nothing with 0 sheep', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const flow = effect.onHarvestFieldPhase!(createState(player), player)
    expect(flow).toBeUndefined()
  })
  it('does nothing when card not played', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.resources.sheep = 10
    const flow = effect.onHarvestFieldPhase!(createState(player), player)
    expect(flow).toBeUndefined()
  })
})

// ===== D38 Milking Stool =====
describe('D38_MilkingStool onHarvestFieldPhase', () => {
  const CARD_ID = 'D38_MilkingStool'
  it('gives 1 food with 1-2 cattle', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.cattle = 2
    const flow = effect.onHarvestFieldPhase!(createState(player), player) as any
    expect(flow?.params).toEqual({ food: 1 })
  })
  it('gives 2 food with 3-4 cattle', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.cattle = 4
    const flow = effect.onHarvestFieldPhase!(createState(player), player) as any
    expect(flow?.params).toEqual({ food: 2 })
  })
  it('gives 3 food with 5+ cattle', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.cattle = 5
    const flow = effect.onHarvestFieldPhase!(createState(player), player) as any
    expect(flow?.params).toEqual({ food: 3 })
  })
  it('gives nothing with 0 cattle', () => {
    const effect = getCardEffect(CARD_ID)!
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const flow = effect.onHarvestFieldPhase!(createState(player), player)
    expect(flow).toBeUndefined()
  })
})

// ===== D154 Chimney Sweep =====
describe('D154_ChimneySweep renovate cost discount', () => {
  it('discounts stone by 2 when renovating clay → stone', () => {
    const listener = findListener('D154-chimney-sweep-compute-costs-renovation')!
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['D154_ChimneySweep']
    player.houseType = 'clay'
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'computeCosts',
    } as any)
    expect(result?.costs).toEqual({ stone: -2 })
  })
  it('does not discount when house is wood (no stone renovation pending)', () => {
    const listener = findListener('D154-chimney-sweep-compute-costs-renovation')!
    const player = createPlayer()
    player.occupationPlayed = ['D154_ChimneySweep']
    player.houseType = 'wood'
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'computeCosts',
    } as any)
    expect(result).toBeUndefined()
  })
  it('does not discount when occupation not played', () => {
    const listener = findListener('D154-chimney-sweep-compute-costs-renovation')!
    const player = createPlayer()
    player.houseType = 'clay'
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'computeCosts',
    } as any)
    expect(result).toBeUndefined()
  })
})
