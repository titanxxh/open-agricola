import { describe, expect, it } from 'vitest'
import type { ComplexCost, CostAttributionBySource, GameState, PlayerState } from '../../contract/types'
import { isComplexCost, resolveCardCostWithModifiersDetailed } from '../../actions/payment/internal'
import { getMinorImprovementPreviewCostDetailed } from '../../actions/helpers/improvement-helpers'
import { setActiveWorkerCount } from '../../domain/player'
import type { CardImpl } from '../registry'
import { A020_DoubleTurnPlow_impl } from '../A/A020_DoubleTurnPlow'
import { A027_OvenSite_impl } from '../A/A027_OvenSite'
import { A075_LumberMill_impl } from '../A/A075_LumberMill'
import { A143_Stonecutter_impl } from '../A/A143_Stonecutter'
import { B036_Bottles_impl } from '../B/B036_Bottles'
import { B095_MasterBricklayer_impl } from '../B/B095_MasterBricklayer'
import { C027_Blueprint_impl } from '../C/C027_Blueprint'
import { C095_BasketWeaver_impl } from '../C/C095_BasketWeaver'
import { C122_Bricklayer_impl } from '../C/C122_Bricklayer'
import { D095_SiteManager_impl } from '../D/D095_SiteManager'
import { D096_Furnisher_impl } from '../D/D096_Furnisher'
import { D117_WoodExpert_impl } from '../D/D117_WoodExpert'
import { E027_PiggyBank_impl } from '../E/E027_PiggyBank'
import { E109_BraidMaker_impl } from '../E/E109_BraidMaker'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (player: PlayerState): GameState =>
  ({
    round: 5,
    currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('card-purchase cost candidate cards', () => {
  const computeCardPurchaseListeners = (impl: CardImpl) =>
    (impl.listeners ?? []).filter((listener) =>
      listener.phases?.includes('computeCosts') && listener.actions?.includes('improvement'),
    )

  // Closure output order is traversal-defined; compare fees+metadata as a
  // set of rows instead of a positional array.
  const rowKey = (row: { resources: PaymentResourceMap; meta?: unknown }) =>
    JSON.stringify({
      resources: Object.entries(row.resources)
        .filter(([, amount]) => amount !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      meta: row.meta,
    })

  const sortedRows = (rows: Array<{ resources: PaymentResourceMap; meta?: unknown }>) =>
    [...rows].sort((a, b) => (rowKey(a) < rowKey(b) ? -1 : rowKey(a) > rowKey(b) ? 1 : 0))

  const expectFeesAndSources = (
    result: ReturnType<typeof resolveCardCostWithModifiersDetailed>,
    fees: NonNullable<ComplexCost['fees']>,
    sourcesByFeeIndex: Record<number, string[]>,
    attributionByFeeIndex: Record<number, CostAttributionBySource> = {},
  ) => {
    expect(isComplexCost(result.cost)).toBe(true)
    const cost = result.cost as ComplexCost
    expect(cost.bonuses).toBeUndefined()
    expect(cost.trades).toBeUndefined()
    const expected = fees.map((resources, index) => ({
      resources,
      meta: {
        originalFeeIndex: index < 2 ? index : 0,
        sources: sourcesByFeeIndex[index] ?? [],
        ...(attributionByFeeIndex[index] ? { costAttribution: attributionByFeeIndex[index] } : {}),
      },
    }))
    const actual = (cost.fees ?? []).map((resources, index) => ({
      resources,
      meta: result.candidateMetadataByFeeIndex?.[index],
    }))
    expect(sortedRows(actual)).toEqual(sortedRows(expected))
  }

  it('keeps migrated card-purchase costs on candidate/base-cost APIs', () => {
    const migratedCandidateImpls = [
      { id: 'A027_OvenSite', impl: A027_OvenSite_impl },
      { id: 'A075_LumberMill', impl: A075_LumberMill_impl },
      { id: 'A143_Stonecutter', impl: A143_Stonecutter_impl },
      { id: 'B095_MasterBricklayer', impl: B095_MasterBricklayer_impl },
      { id: 'C027_Blueprint', impl: C027_Blueprint_impl },
      { id: 'C095_BasketWeaver', impl: C095_BasketWeaver_impl },
      { id: 'C122_Bricklayer', impl: C122_Bricklayer_impl },
      { id: 'D095_SiteManager', impl: D095_SiteManager_impl },
      { id: 'D096_Furnisher', impl: D096_Furnisher_impl },
      { id: 'D117_WoodExpert', impl: D117_WoodExpert_impl },
      { id: 'E027_PiggyBank', impl: E027_PiggyBank_impl },
      { id: 'E109_BraidMaker', impl: E109_BraidMaker_impl },
    ] satisfies Array<{ id: string, impl: CardImpl }>

    for (const { id, impl } of migratedCandidateImpls) {
      const listeners = computeCardPurchaseListeners(impl)
      expect(listeners.length, id).toBeGreaterThan(0)
      for (const listener of listeners) {
        expect(listener.deriveCardCostCandidate, id).toBeTypeOf('function')
        expect(listener.handler, id).toBeUndefined()
      }
    }

    for (const { id, impl } of [
      { id: 'A020_DoubleTurnPlow', impl: A020_DoubleTurnPlow_impl },
      { id: 'B036_Bottles', impl: B036_Bottles_impl },
    ] satisfies Array<{ id: string, impl: CardImpl }>) {
      expect(impl.getBaseCosts, id).toBeTypeOf('function')
      expect(computeCardPurchaseListeners(impl), id).toEqual([])
    }
  })

  it('simple resource discount cards append sourced candidates', () => {
    const cases = [
      {
        playedZone: 'occupationPlayed',
        source: 'A143_Stonecutter',
        target: 'Major_Test',
        base: { fees: [{ stone: 1 }, { wood: 1 }] },
        fees: [{ stone: 1 }, { wood: 1 }, {}],
        attribution: { 2: { A143_Stonecutter: { saved: { stone: 1 } } } },
      },
      {
        playedZone: 'minorPlayed',
        source: 'A075_LumberMill',
        target: 'Major_Test',
        base: { fees: [{ wood: 2 }, { stone: 1 }] },
        fees: [{ wood: 2 }, { stone: 1 }, { wood: 1 }],
        attribution: { 2: { A075_LumberMill: { saved: { wood: 1 } } } },
      },
      {
        playedZone: 'occupationPlayed',
        source: 'C122_Bricklayer',
        target: 'Major_Test',
        base: { fees: [{ clay: 1 }, { wood: 1 }] },
        fees: [{ clay: 1 }, { wood: 1 }, {}],
        attribution: { 2: { C122_Bricklayer: { saved: { clay: 1 } } } },
      },
    ] as const

    for (const entry of cases) {
      const player = createPlayer()
      player[entry.playedZone] = [entry.source]
      const result = resolveCardCostWithModifiersDetailed(
        createState(player),
        player,
        'improvement',
        entry.target,
        entry.base,
      )
      expectFeesAndSources(result, entry.fees, { 2: [entry.source] }, entry.attribution)
    }
  })

  it('B95 appends major stone discounts based on rooms beyond the initial house', () => {
    const player = createPlayer()
    player.occupationPlayed = ['B095_MasterBricklayer']
    player.rooms = 4
    const state = createState(player)

    const major = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Joinery',
      { fees: [{ stone: 1 }, { stone: 3 }] },
    )
    expect(isComplexCost(major.cost)).toBe(true)
    const majorCost = major.cost as ComplexCost
    const majorRows = (majorCost.fees ?? []).map((resources, index) => ({
      resources,
      sources: major.candidateMetadataByFeeIndex?.[index]?.sources ?? [],
    }))
    expect(sortedRows(majorRows.map(({ resources, sources }) => ({ resources, meta: sources }))))
      .toEqual(sortedRows([
        { resources: { stone: 1 }, meta: [] },
        { resources: { stone: 3 }, meta: [] },
        { resources: {}, meta: ['B095_MasterBricklayer'] },
        { resources: { stone: 1 }, meta: ['B095_MasterBricklayer'] },
      ]))

    const minor = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'C082_HardwareStore',
      { stone: 2 },
    )
    expect(minor.cost).toEqual({ stone: 2 })
    expect(minor.candidateMetadataByFeeIndex).toBeUndefined()
  })

  it('C27 appends sourced stone discounts only for Blueprint majors', () => {
    const player = createPlayer()
    player.minorPlayed = ['C027_Blueprint']
    const state = createState(player)

    const allowed = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Joinery',
      { wood: 2, stone: 2 },
    )
    expect(isComplexCost(allowed.cost)).toBe(true)
    expect((allowed.cost as ComplexCost).fees).toEqual([
      { wood: 2, stone: 2 },
      { wood: 2, stone: 1 },
    ])
    expect(allowed.candidateMetadataByFeeIndex?.[1]?.sources).toEqual(['C027_Blueprint'])

    const other = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Fireplace1',
      { clay: 2 },
    )
    expect(other.cost).toEqual({ clay: 2 })
    expect(other.candidateMetadataByFeeIndex).toBeUndefined()
  })

  it('D96 appends wood discount candidates only for Furnisher-triggered improvements', () => {
    const player = createPlayer()
    player.occupationPlayed = ['D096_Furnisher']
    const state = createState(player)

    const triggered = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Test',
      { wood: 1 },
      'D096_Furnisher',
    )
    expect(isComplexCost(triggered.cost)).toBe(true)
    expect((triggered.cost as ComplexCost).fees).toEqual([{ wood: 1 }, {}])
    expect(triggered.candidateMetadataByFeeIndex?.[1]?.sources).toEqual(['D096_Furnisher'])

    const ordinary = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Test',
      { wood: 1 },
      'improvement',
    )
    expect(ordinary.cost).toEqual({ wood: 1 })
    expect(ordinary.candidateMetadataByFeeIndex).toBeUndefined()
  })

  it('A20 and B36 produce dynamic base candidates before card-purchase modifiers', () => {
    const player = createPlayer()
    player.minorHand = ['A020_DoubleTurnPlow', 'B036_Bottles']
    setActiveWorkerCount(player, 3)
    const state = createState(player)

    state.round = 3
    const earlyPlow = getMinorImprovementPreviewCostDetailed(state, player, 'A020_DoubleTurnPlow')
    expect(isComplexCost(earlyPlow?.cost)).toBe(true)
    expect((earlyPlow?.cost as ComplexCost).fees).toEqual([{ grain: 1, food: 0 }])

    state.round = 4
    const latePlow = getMinorImprovementPreviewCostDetailed(state, player, 'A020_DoubleTurnPlow')
    expect(isComplexCost(latePlow?.cost)).toBe(true)
    expect((latePlow?.cost as ComplexCost).fees).toEqual([{ grain: 1, food: 1 }])

    const bottles = getMinorImprovementPreviewCostDetailed(state, player, 'B036_Bottles')
    expect(isComplexCost(bottles?.cost)).toBe(true)
    expect((bottles?.cost as ComplexCost).fees).toEqual([{ clay: 3, food: 3 }])
  })

  it('D117 appends wood-for-food candidates only from current wood costs', () => {
    const player = createPlayer()
    player.occupationPlayed = ['D117_WoodExpert']
    const state = createState(player)

    const result = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Test',
      { fees: [{ wood: 1, clay: 1 }, { stone: 1 }, { wood: 3 }] },
    )

    expect(isComplexCost(result.cost)).toBe(true)
    const cost = result.cost as ComplexCost
    expect(sortedRows((cost.fees ?? []).map((resources) => ({ resources }))))
      .toEqual(sortedRows([
        { resources: { wood: 1, clay: 1 } },
        { resources: { stone: 1 } },
        { resources: { wood: 3 } },
        { resources: { clay: 1, food: 1 } },
        { resources: { wood: 1, food: 1 } },
      ]))
    expect(cost.trades).toBeUndefined()
    const rows = (cost.fees ?? []).map((resources, index) => ({
      resources,
      meta: result.candidateMetadataByFeeIndex?.[index],
    }))
    expect(sortedRows(rows)).toEqual(sortedRows([
      { resources: { wood: 1, clay: 1 }, meta: { originalFeeIndex: 0, sources: [] } },
      { resources: { stone: 1 }, meta: { originalFeeIndex: 1, sources: [] } },
      { resources: { wood: 3 }, meta: { originalFeeIndex: 2, sources: [] } },
      {
        resources: { clay: 1, food: 1 },
        meta: {
          originalFeeIndex: 0,
          sources: ['D117_WoodExpert'],
          costAttribution: {
            D117_WoodExpert: {
              saved: { wood: 1 },
              paid: { food: 1 },
            },
          },
        },
      },
      {
        resources: { wood: 1, food: 1 },
        meta: {
          originalFeeIndex: 2,
          sources: ['D117_WoodExpert'],
          costAttribution: {
            D117_WoodExpert: {
              saved: { wood: 2 },
              paid: { food: 1 },
            },
          },
        },
      },
    ]))
  })
})
