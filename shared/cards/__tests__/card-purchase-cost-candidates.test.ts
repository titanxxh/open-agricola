import { describe, expect, it } from 'vitest'
import type { ComplexCost, GameState, PlayerState } from '../../contract/types'
import { isComplexCost, resolveCardCostWithModifiersDetailed } from '../../actions/payment/internal'
import { getMinorImprovementPreviewCostDetailed } from '../../actions/helpers/improvement-helpers'
import { setActiveWorkerCount } from '../../domain/player'

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
  const expectFeesAndSources = (
    result: ReturnType<typeof resolveCardCostWithModifiersDetailed>,
    fees: NonNullable<ComplexCost['fees']>,
    sourcesByFeeIndex: Record<number, string[]>,
  ) => {
    expect(isComplexCost(result.cost)).toBe(true)
    const cost = result.cost as ComplexCost
    expect(cost.fees).toEqual(fees)
    expect(cost.bonuses).toBeUndefined()
    expect(cost.trades).toBeUndefined()
    expect(result.candidateMetadataByFeeIndex).toEqual(
      Object.fromEntries(
        fees.map((_, index) => [
          index,
          {
            originalFeeIndex: index < 2 ? index : 0,
            sources: sourcesByFeeIndex[index] ?? [],
          },
        ]),
      ),
    )
  }

  it('simple resource discount cards append sourced candidates', () => {
    const cases = [
      {
        playedZone: 'occupationPlayed',
        source: 'A143_Stonecutter',
        target: 'Major_Test',
        base: { fees: [{ stone: 1 }, { wood: 1 }] },
        fees: [{ stone: 1 }, { wood: 1 }, { stone: 0 }],
      },
      {
        playedZone: 'minorPlayed',
        source: 'A75_LumberMill',
        target: 'Major_Test',
        base: { fees: [{ wood: 2 }, { stone: 1 }] },
        fees: [{ wood: 2 }, { stone: 1 }, { wood: 1 }],
      },
      {
        playedZone: 'occupationPlayed',
        source: 'C122_Bricklayer',
        target: 'Major_Test',
        base: { fees: [{ clay: 1 }, { wood: 1 }] },
        fees: [{ clay: 1 }, { wood: 1 }, { clay: 0 }],
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
      expectFeesAndSources(result, entry.fees, { 2: [entry.source] })
    }
  })

  it('B95 appends major stone discounts based on rooms beyond the initial house', () => {
    const player = createPlayer()
    player.occupationPlayed = ['B95_MasterBricklayer']
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
    expect((major.cost as ComplexCost).fees).toEqual([
      { stone: 1 },
      { stone: 3 },
      { stone: 0 },
      { stone: 1 },
    ])
    expect(major.candidateMetadataByFeeIndex?.[2]?.sources).toEqual(['B95_MasterBricklayer'])
    expect(major.candidateMetadataByFeeIndex?.[3]?.sources).toEqual(['B95_MasterBricklayer'])

    const minor = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'C82_HardwareStore',
      { stone: 2 },
    )
    expect(minor.cost).toEqual({ stone: 2 })
    expect(minor.candidateMetadataByFeeIndex).toBeUndefined()
  })

  it('C27 appends sourced stone discounts only for Blueprint majors', () => {
    const player = createPlayer()
    player.minorPlayed = ['C27_Blueprint']
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
    expect(allowed.candidateMetadataByFeeIndex?.[1]?.sources).toEqual(['C27_Blueprint'])

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
    player.occupationPlayed = ['D96_Furnisher']
    const state = createState(player)

    const triggered = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Test',
      { wood: 1 },
      'D96_Furnisher',
    )
    expect(isComplexCost(triggered.cost)).toBe(true)
    expect((triggered.cost as ComplexCost).fees).toEqual([{ wood: 1 }, { wood: 0 }])
    expect(triggered.candidateMetadataByFeeIndex?.[1]?.sources).toEqual(['D96_Furnisher'])

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
    player.minorHand = ['A20_DoubleTurnPlow', 'B36_Bottles']
    setActiveWorkerCount(player, 3)
    const state = createState(player)

    state.round = 3
    const earlyPlow = getMinorImprovementPreviewCostDetailed(state, player, 'A20_DoubleTurnPlow')
    expect(isComplexCost(earlyPlow?.cost)).toBe(true)
    expect((earlyPlow?.cost as ComplexCost).fees).toEqual([{ grain: 1, food: 0 }])

    state.round = 4
    const latePlow = getMinorImprovementPreviewCostDetailed(state, player, 'A20_DoubleTurnPlow')
    expect(isComplexCost(latePlow?.cost)).toBe(true)
    expect((latePlow?.cost as ComplexCost).fees).toEqual([{ grain: 1, food: 1 }])

    const bottles = getMinorImprovementPreviewCostDetailed(state, player, 'B36_Bottles')
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
    expect(cost.fees).toEqual([
      { wood: 1, clay: 1 },
      { stone: 1 },
      { wood: 3 },
      { wood: 0, clay: 1, food: 1 },
      { wood: 1, food: 1 },
    ])
    expect(cost.trades).toBeUndefined()
    expect(result.candidateMetadataByFeeIndex).toEqual({
      0: { originalFeeIndex: 0, sources: [] },
      1: { originalFeeIndex: 1, sources: [] },
      2: { originalFeeIndex: 2, sources: [] },
      3: { originalFeeIndex: 0, sources: ['D117_WoodExpert'] },
      4: { originalFeeIndex: 2, sources: ['D117_WoodExpert'] },
    })
  })
})
