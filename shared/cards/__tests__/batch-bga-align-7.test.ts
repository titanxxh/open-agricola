import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'
import { buildHarvestFeedOptions } from '../../../src/app/hooks/use-harvest-flow'

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

const createState = (playerCount: number, ...players: PlayerState[]): GameState => {
  const ps = players.length ? players : [createPlayer()]
  while (ps.length < playerCount) ps.push(createPlayer(`p${ps.length + 1}`))
  return ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players: ps,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState
}

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

// Minimal test for harvest-trigger infrastructure. C59's actual exchange is added in Task 3.
describe('harvest trigger exchange infrastructure', () => {
  it('buildHarvestFeedOptions exists and returns an array', () => {
    const p = createPlayer()
    const opts = buildHarvestFeedOptions(p, 'en', (id) => id)
    expect(Array.isArray(opts)).toBe(true)
  })
  it('HarvestFeedOption type accepts optional max field', () => {
    const opt = { id: 'x', sourceName: 's', resourceKey: 'vegetable' as const, food: 5, max: 1 }
    expect(opt.max).toBe(1)
  })
})

// ===== Task 3: C59 SchnappsDistillery harvest exchange =====
import { C59_SchnappsDistillery } from '../C/C59_SchnappsDistillery'
import '../C/C59_SchnappsDistillery'

describe('C59_SchnappsDistillery harvest exchange', () => {
  it('declares a harvest exchange: 1 vegetable → 5 food, max 1', () => {
    const exchanges = (C59_SchnappsDistillery as any).exchanges
    expect(exchanges).toEqual([
      { from: { vegetable: 1 }, to: { food: 5 }, max: 1, trigger: 'harvest' },
    ])
  })

  it('appears in buildHarvestFeedOptions when player has vegetable and C59 played', () => {
    const p = createPlayer()
    p.minorPlayed = ['C59_SchnappsDistillery']
    p.resources.vegetable = 1
    const options = buildHarvestFeedOptions(p, 'en', (id) => id)
    const c59opt = options.find((o: any) => o.id.startsWith('C59_SchnappsDistillery-harvest'))
    expect(c59opt).toBeDefined()
    expect(c59opt!.food).toBe(5)
    expect(c59opt!.resourceKey).toBe('vegetable')
    expect(c59opt!.max).toBe(1)
  })

  it('does not appear when player has no vegetable', () => {
    const p = createPlayer()
    p.minorPlayed = ['C59_SchnappsDistillery']
    p.resources.vegetable = 0
    const options = buildHarvestFeedOptions(p, 'en', (id) => id)
    const c59opt = options.find((o: any) => o.id.startsWith('C59_SchnappsDistillery-harvest'))
    expect(c59opt).toBeUndefined()
  })
})

// ===== Task 4: B27 Toolbox =====
import '../B/B27_Toolbox'

describe('B27_Toolbox rewrite', () => {
  it('after construct offers improvement-any filtered to Joinery/Pottery/Basket', () => {
    const listener = findListener('B27-toolbox-after-construct')!
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['B27_Toolbox']
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    const flow = result!.flow as any
    expect(flow.actionId).toBe('improvement-any')
    expect(flow.actionContext?.allowedPurchases).toEqual(
      expect.arrayContaining(['Major_Joinery', 'Major_Pottery', 'Major_Basket'])
    )
  })

  it('after build-stables also offers the same flow', () => {
    const listener = findListener('B27-toolbox-after-stables')!
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['B27_Toolbox']
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('build-stables'),
      actionId: 'build-stables', phase: 'after',
    } as any)
    expect((result!.flow as any).actionId).toBe('improvement-any')
  })

  it('after fencing also triggers (new listener)', () => {
    const listener = findListener('B27-toolbox-after-fencing')!
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['B27_Toolbox']
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('fencing'),
      actionId: 'fencing', phase: 'after',
    } as any)
    expect((result!.flow as any).actionId).toBe('improvement-any')
    expect((result!.flow as any).actionContext?.allowedPurchases).toEqual(
      expect.arrayContaining(['Major_Joinery', 'Major_Pottery', 'Major_Basket'])
    )
  })

  it('does not trigger when card not played', () => {
    const listener = findListener('B27-toolbox-after-construct')!
    const p = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== Task 5: C48 Farmstead per-turn used-space gain =====
import '../C/C48_Farmstead'

describe('C48_Farmstead per-turn used-space gain', () => {
  it('no longer has onBuy (no future meeples)', () => {
    const effect = getCardEffect('C48_Farmstead')
    expect(effect?.onBuy).toBeUndefined()
  })

  it('before listener snapshots used-tile count', () => {
    const listener = findListener('C48-farmstead-before-place-farmer')!
    expect(listener).toBeDefined()
  })

  it('after listener grants 1 food when used-tile count increased', () => {
    const afterListener = findListener('C48-farmstead-after-place-farmer')!
    const beforeListener = findListener('C48-farmstead-before-place-farmer')!
    const p = createPlayer()
    p.minorPlayed = ['C48_Farmstead']
    p.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }] as any
    const state = createState(2, p)

    // Run before listener to snapshot current used-tile count (2)
    beforeListener.handler({
      state, player: p, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'before',
    } as any)

    // Simulate plowing a field — used-tile count grows to 3
    p.fields = [{ crop: null, remaining: 0, row: 1, col: 0 } as any]

    const result = afterListener.handler({
      state, player: p, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    const flow = result!.flow as any
    expect(flow.actionId).toBe('gain')
    expect(flow.params).toEqual({ food: 1 })
  })

  it('after listener does nothing when used-tile count did not increase', () => {
    const afterListener = findListener('C48-farmstead-after-place-farmer')!
    const beforeListener = findListener('C48-farmstead-before-place-farmer')!
    const p = createPlayer()
    p.minorPlayed = ['C48_Farmstead']
    p.roomTiles = [{ row: 0, col: 0 }] as any
    const state = createState(2, p)
    beforeListener.handler({
      state, player: p, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'before',
    } as any)
    // No changes — used-tile count stays at 1
    const result = afterListener.handler({
      state, player: p, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('only fires once per turn even if multiple spaces newly used', () => {
    const afterListener = findListener('C48-farmstead-after-place-farmer')!
    const beforeListener = findListener('C48-farmstead-before-place-farmer')!
    const p = createPlayer()
    p.minorPlayed = ['C48_Farmstead']
    p.roomTiles = [{ row: 0, col: 0 }] as any
    const state = createState(2, p)
    beforeListener.handler({
      state, player: p, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'before',
    } as any)
    // Plow + construct — count goes 1 → 3
    p.fields = [{ crop: null, remaining: 0, row: 1, col: 0 } as any]
    p.roomTiles.push({ row: 2, col: 0 } as any)
    const result = afterListener.handler({
      state, player: p, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    // Still only 1 food (per-turn not per-space)
    expect((result!.flow as any).params).toEqual({ food: 1 })
  })

  it('does not double-count a stable inside a pasture (bug fix)', () => {
    const afterListener = findListener('C48-farmstead-after-place-farmer')!
    const beforeListener = findListener('C48-farmstead-before-place-farmer')!
    const p = createPlayer()
    p.minorPlayed = ['C48_Farmstead']
    // Start: 1 pasture covering (2,0)
    p.pastures = [{ id: 'p1', tiles: [{ row: 2, col: 0 }], animalType: null, animalCount: 0, stables: 0 }] as any
    const state = createState(2, p)
    beforeListener.handler({
      state, player: p, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'before',
    } as any)
    // Now add a stable on the SAME tile (2,0). Pasture now has 1 stable inside.
    p.stableTiles = [{ row: 2, col: 0 }] as any
    p.pastures[0]!.stables = 1
    const result = afterListener.handler({
      state, player: p, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    // Tile (2,0) was already used as a pasture tile. Adding a stable there shouldn't count as new.
    expect(result).toBeUndefined()
  })
})

// ===== Task 6: C69 LandConsolidation field-local swap =====
import '../C/C69_LandConsolidation'

describe('C69_LandConsolidation field swap', () => {
  it('offers anytime action when player has grain field with remaining=3', () => {
    const listener = findListener('C69-land-consolidation-anytime')!
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['C69_LandConsolidation']
    p.fields = [{ crop: 'grain', remaining: 3, row: 1, col: 0 } as any]
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(result).toBeDefined()
    const flow = result!.flow as any
    expect(flow.actionId).toBe('swap-field-grain-to-veg')
    expect(flow.params).toEqual({ row: 1, col: 0 })
  })

  it('not available when grain field has remaining=2', () => {
    const listener = findListener('C69-land-consolidation-anytime')!
    const p = createPlayer()
    p.minorPlayed = ['C69_LandConsolidation']
    p.fields = [{ crop: 'grain', remaining: 2, row: 1, col: 0 } as any]
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(result).toBeUndefined()
  })

  it('not available when only vegetable fields exist', () => {
    const listener = findListener('C69-land-consolidation-anytime')!
    const p = createPlayer()
    p.minorPlayed = ['C69_LandConsolidation']
    p.fields = [{ crop: 'vegetable', remaining: 2, row: 1, col: 0 } as any]
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    expect(result).toBeUndefined()
  })

  it('offers xor choice when multiple qualifying grain fields exist', () => {
    const listener = findListener('C69-land-consolidation-anytime')!
    const p = createPlayer()
    p.minorPlayed = ['C69_LandConsolidation']
    p.fields = [
      { crop: 'grain', remaining: 3, row: 1, col: 0 } as any,
      { crop: 'grain', remaining: 3, row: 1, col: 1 } as any,
    ]
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('trigger'),
      actionId: 'trigger', phase: 'anytime',
    } as any)
    const flow = result!.flow as any
    expect(flow.type).toBe('xor')
    expect(flow.children.length).toBe(2)
    expect(flow.children[0].actionId).toBe('swap-field-grain-to-veg')
  })

  it('the swap action mutates the field correctly', async () => {
    // Integration: import the action and call its execute directly
    const { swapFieldGrainToVegAction } = await import(
      '../../actions/effects/swap-field-crop'
    )
    const p = createPlayer()
    p.fields = [{ crop: 'grain', remaining: 3, row: 1, col: 0 } as any]
    const result = swapFieldGrainToVegAction.execute({
      state: createState(2, p), player: p, space: {} as any,
      params: { row: 1, col: 0 },
    } as any)
    expect(result.type).toBe('ok')
    expect(p.fields[0]!.crop).toBe('vegetable')
    expect(p.fields[0]!.remaining).toBe(1)
  })
})

// ===== Task 7: D82 HuntingTrophy =====
import { D82_HuntingTrophy } from '../D/D82_HuntingTrophy'

describe('D82_HuntingTrophy computeCosts', () => {
  it('card definition: no exchanges, category=BUILDING_RESOURCE_PROVIDER', () => {
    expect((D82_HuntingTrophy as any).exchanges).toBeUndefined()
    expect((D82_HuntingTrophy as any).category).toBe('BUILDING_RESOURCE_PROVIDER')
  })

  it('card no longer has onBuy food gain', () => {
    const effect = getCardEffect('D82_HuntingTrophy')
    expect(effect?.onBuy).toBeUndefined()
  })

  it('discounts 1 building resource on house-redevelopment improvement-any', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-improvement')!
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('house-redevelopment'),
      actionId: 'improvement-any', phase: 'computeCosts',
      costs: { clay: 5, reed: 2 },
    } as any)
    expect(result?.costs).toBeDefined()
    // Should reduce clay by 1 (most expensive)
    expect(result!.costs).toEqual({ clay: -1 })
  })

  it('discounts wood by 3 on farm-redevelopment fencing', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-fencing')!
    expect(listener).toBeDefined()
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('farm-redevelopment'),
      actionId: 'fence', phase: 'computeCosts',
    } as any)
    expect(result?.costs).toEqual({ wood: -3 })
  })

  it('no discount on non-redevelopment spaces (standalone improvement-any)', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-improvement')!
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'computeCosts',
      costs: { clay: 3 },
    } as any)
    expect(result).toBeUndefined()
  })

  it('no discount on non-redevelopment spaces (standalone fencing)', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-fencing')!
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('fencing'),
      actionId: 'fence', phase: 'computeCosts',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when card not played', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-improvement')!
    const p = createPlayer()
    // minorPlayed stays empty
    const result = executeCardListener(listener, {
      state: createState(2, p), player: p, space: createSpace('house-redevelopment'),
      actionId: 'improvement-any', phase: 'computeCosts',
      costs: { clay: 5 },
    } as any)
    expect(result).toBeUndefined()
  })

  it('picks the most-expensive resource when multiple building resources present', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-improvement')!
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('house-redevelopment'),
      actionId: 'improvement-any', phase: 'computeCosts',
      costs: { wood: 1, stone: 3, reed: 2 },
    } as any)
    // stone=3 is the max; discount stone by 1
    expect(result!.costs).toEqual({ stone: -1 })
  })

  it('returns undefined when cost map has no building resources', () => {
    const listener = findListener('D82-hunting-trophy-compute-costs-improvement')!
    const p = createPlayer()
    p.minorPlayed = ['D82_HuntingTrophy']
    const state = createState(2, p)
    const result = executeCardListener(listener, {
      state, player: p, space: createSpace('house-redevelopment'),
      actionId: 'improvement-any', phase: 'computeCosts',
      costs: { food: 2 },
    } as any)
    expect(result).toBeUndefined()
  })
})

export { createPlayer, createState, createSpace, findListener, getCardEffect, executeCardListener }
