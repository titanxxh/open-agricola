import { afterEach, describe, expect, it } from 'vitest'
import type { ComplexCost, GameState, PaymentResourceMap, PaymentSolution, PlayerState, Resource } from '../../contract/types'
import { requireActiveCardRegistry } from '../active-registry'
import { playImprovement } from '../../actions/effects/improvement'
import { computePaymentOptionsForTest, resolveCardCostDetailedForTest } from '../../actions/payment/__tests__/test-helpers'
import type { CardListenerRegistration } from '../card-listeners'
import { createInitialPlayerStats } from '../../session/stats'

import '../A/A027_OvenSite'
import '../A/A075_LumberMill'
import '../A/A143_Stonecutter'
import '../B/B065_GrainDepot'
import '../C/C095_BasketWeaver'
import '../D/D117_WoodExpert'
import '../D/D095_SiteManager'
import '../E/E130_Overachiever'
import '../E/E109_BraidMaker'
import '../E/E027_PiggyBank'

const HOOK_CARD = 'HookFreeGrainDepot'

const createState = (): GameState =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players: [],
    actionSpaces: [],
    log: [],
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

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
    extraOccupationsFromCards: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
    stats: createInitialPlayerStats({ isFirstPlayer: false }),
  }) as unknown as PlayerState

const expectPaymentRequest = (result: ReturnType<typeof playImprovement>) => {
  expect(result.type).toBe('request')
  if (result.type !== 'request') return []
  expect(result.promptKey).toBe('prompt.selectPayment')
  expect(result.request.kind).toBe('choice')
  return result.request.kind === 'choice' ? result.request.options : []
}

const hasPaidResources = (
  option: { labelParams?: Record<string, unknown> },
  expected: PaymentResourceMap,
) => {
  const actual = (option.labelParams?.resourcesPaid ?? {}) as PaymentResourceMap
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  return [...keys].every((key) =>
    (actual[key as keyof PaymentResourceMap] ?? 0) === (expected[key as keyof PaymentResourceMap] ?? 0),
  )
}

const nonZeroPaid = (solution: PaymentSolution): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const [key, value] of Object.entries(solution.resourcesPaid)) {
    if ((value ?? 0) !== 0) out[key as keyof Resource] = value
  }
  return out
}

const sortedJson = (values: unknown[]) =>
  values.map((value) => JSON.stringify(value)).sort()

const RESOURCE_ORDER: (keyof Resource)[] = [
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
]

const positiveResources = (resources: PaymentResourceMap): PaymentResourceMap => {
  const out: PaymentResourceMap = {}
  for (const key of RESOURCE_ORDER) {
    const value = resources[key]
    if ((value ?? 0) > 0) out[key] = value
  }
  return out
}

const candidateOptions = (result: ReturnType<typeof resolveCardCostDetailedForTest>) => {
  const cost = result.cost as ComplexCost
  return (cost.fees ?? []).map((resources, index) => ({
    resources: positiveResources(resources),
    sources: [...(result.candidateMetadataByFeeIndex?.[index]?.sources ?? [])].sort(),
  }))
}

describe('fixed card-purchase cost candidates', () => {
  afterEach(() => {
    requireActiveCardRegistry('card-cost-fixed-candidates')
      .removeListenersWhere((listener) => listener.id === 'hook-free-grain-depot')
  })

  it('C95 buys the Basketmaker for the fixed price; the dominated printed cost is never offered', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    state.availableMajorImprovements = ['Major_Basket']
    player.occupationPlayed = ['C095_BasketWeaver']
    player.resources.reed = 2
    player.resources.stone = 2

    const result = playImprovement(
      state,
      player,
      'major:Major_Basket',
      'any',
      undefined,
      'C095_BasketWeaver',
    )

    if (result.type === 'request') {
      const options = expectPaymentRequest(result)
      expect(options.some((option) => hasPaidResources(option, { reed: 2, stone: 2 }))).toBe(false)
      const fixed = options.find((option) => hasPaidResources(option, { reed: 1, stone: 1 }))
      expect(fixed).toBeDefined()
    } else {
      expect(player.improvements).toContain('Major_Basket')
      expect(player.resources.reed).toBe(1)
      expect(player.resources.stone).toBe(1)
    }
  })

  it('E109 offers the fixed Basketmaker price; the dominated printed cost is never offered', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    state.availableMajorImprovements = ['Major_Basket']
    player.occupationPlayed = ['E109_BraidMaker']
    player.resources.reed = 2
    player.resources.stone = 2

    const result = playImprovement(state, player, 'major:Major_Basket', 'any')

    if (result.type === 'request') {
      const options = expectPaymentRequest(result)
      expect(options.some((option) => hasPaidResources(option, { reed: 2, stone: 2 }))).toBe(false)
      expect(options.find((option) => hasPaidResources(option, { reed: 1, stone: 1 }))).toBeDefined()
    } else {
      expect(player.improvements).toContain('Major_Basket')
      expect(player.resources.reed).toBe(1)
      expect(player.resources.stone).toBe(1)
    }
  })

  it('A27 replaces the printed oven cost with the fixed oven payment candidate', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    state.availableMajorImprovements = ['Major_ClayOven']
    player.minorPlayed = ['A027_OvenSite']
    player.resources.clay = 3
    player.resources.stone = 1

    const result = resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_ClayOven',
      { clay: 3, stone: 1 },
      'A027_OvenSite',
    )

    expect(candidateOptions(result)).toEqual([
      {
        resources: { clay: 1, stone: 1 },
        sources: ['A027_OvenSite'],
      },
    ])
  })

  it('A75 discount preserves the original payment candidate at resolver level', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.minorPlayed = ['A075_LumberMill']

    const result = resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_Joinery',
      { wood: 2, clay: 2, reed: 2, stone: 2 },
    )

    expect(sortedJson(candidateOptions(result))).toEqual(sortedJson([
      {
        resources: { wood: 2, clay: 2, reed: 2, stone: 2 },
        sources: [],
      },
      {
        resources: { wood: 1, clay: 2, reed: 2, stone: 2 },
        sources: ['A075_LumberMill'],
      },
    ]))
  })

  it('E130 offers exactly one non-optional resource discount choice', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.occupationPlayed = ['E130_Overachiever']
    player.resources = {
      ...player.resources,
      wood: 2,
      clay: 2,
      reed: 2,
      stone: 2,
    }

    const result = resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_Joinery',
      { wood: 2, clay: 2, reed: 2, stone: 2 },
      'E130_Overachiever',
    )
    const cost = result.cost as ComplexCost
    expect(cost.bonuses).toHaveLength(1)
    expect(cost.bonuses?.[0]).toMatchObject({
      optional: false,
      sources: ['E130_Overachiever'],
    })
    expect(cost.bonuses?.[0]?.choices).toHaveLength(10)

    const payments = computePaymentOptionsForTest(player, cost).map(nonZeroPaid)
    expect(sortedJson(payments)).toEqual(sortedJson([
      { wood: 1, clay: 2, reed: 2, stone: 2 },
      { wood: 2, clay: 1, reed: 2, stone: 2 },
      { wood: 2, clay: 2, reed: 1, stone: 2 },
      { wood: 2, clay: 2, reed: 2, stone: 1 },
    ]))
  })

  it('Basket fixed-price candidates combine only with later applicable wood and stone modifiers', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.occupationPlayed = [
      'C095_BasketWeaver',
      'E109_BraidMaker',
      'A143_Stonecutter',
      'D117_WoodExpert',
    ]

    const result = resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_Basket',
      { wood: 2, reed: 2, stone: 2 },
      'C095_BasketWeaver',
    )

    // Candidate Closure (ADR 0004): fixed-price rows report their own card
    // as the sole source instead of merging sources from whichever row they
    // were derived from, so the multi-source attribution combos of the old
    // ordered fold ({C95+E109} rows) no longer appear. The player-visible
    // resource set is unchanged.
    const sortSources = (rows: ReturnType<typeof candidateOptions>) =>
      rows.map((row) => ({ ...row, sources: [...row.sources].sort() }))
    // ADR 0004 amendment: rows equivalent up to sources keep one
    // deterministic representative (fewest sources, then key order), so the
    // C95/E109 fixed-price twins and their discounted twins collapse.
    expect(sortedJson(sortSources(candidateOptions(result)))).toEqual(sortedJson(sortSources([
      { resources: { reed: 1, stone: 1 }, sources: ['C095_BasketWeaver'] },
      { resources: { reed: 1 }, sources: ['A143_Stonecutter', 'C095_BasketWeaver'] },
      { resources: { reed: 2, stone: 1, food: 1 }, sources: ['A143_Stonecutter', 'D117_WoodExpert'] },
      { resources: { reed: 2, stone: 2, food: 1 }, sources: ['D117_WoodExpert'] },
      { resources: { wood: 2, reed: 2, stone: 1 }, sources: ['A143_Stonecutter'] },
      { resources: { wood: 2, reed: 2, stone: 2 }, sources: [] },
    ])))
  })

  it('E27 resolves the flagged major purchase free; dominated paid options are never offered', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    state.availableMajorImprovements = ['Major_Joinery']
    player.minorPlayed = ['E027_PiggyBank']
    player.cardStates = { E027_PiggyBank: { flagged: true } }
    player.resources.wood = 2
    player.resources.stone = 2

    const result = playImprovement(state, player, 'major:Major_Joinery', 'any')

    if (result.type === 'request') {
      const options = expectPaymentRequest(result)
      expect(options.some((option) => hasPaidResources(option, { wood: 2, stone: 2 }))).toBe(false)
      const free = options.find((option) => hasPaidResources(option, {}))
      expect(free?.labelParams.sourceCards).toEqual(['E027_PiggyBank'])
    } else {
      expect(player.improvements).toContain('Major_Joinery')
      expect(player.resources.wood).toBe(2)
      expect(player.resources.stone).toBe(2)
    }
  })

  it('D95 derives replacement candidates for every non-empty subset of present building resources', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.occupationPlayed = ['D095_SiteManager']

    const result = resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_Joinery',
      { wood: 2, stone: 2 },
      'D095_SiteManager',
    )

    expect(sortedJson(candidateOptions(result))).toEqual(sortedJson([
      { resources: { wood: 2, stone: 2 }, sources: [] },
      { resources: { wood: 1, stone: 2, food: 1 }, sources: ['D095_SiteManager'] },
      { resources: { wood: 2, stone: 1, food: 1 }, sources: ['D095_SiteManager'] },
      { resources: { wood: 1, stone: 1, food: 2 }, sources: ['D095_SiteManager'] },
    ]))
    expect('bonuses' in result.cost).toBe(false)
  })

  it('B65 keeps the original path identity when a derived payment candidate is selected', () => {
    const hook: CardListenerRegistration = {
      id: 'hook-free-grain-depot',
      cardIds: [HOOK_CARD],
      phases: ['computeCosts'],
      actions: ['improvement'],
      deriveCardCostCandidate: (context, candidate) => {
        if (context.cardId !== 'B065_GrainDepot') return null
        if (candidate.originalFeeIndex !== 1) return null
        if (candidate.sources.includes(HOOK_CARD)) return null
        return {
          resources: {},
          originalFeeIndex: candidate.originalFeeIndex,
          sources: [...candidate.sources, HOOK_CARD],
        }
      },
    }
    requireActiveCardRegistry('card-cost-fixed-candidates').registerListener(hook)

    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.occupationPlayed = [HOOK_CARD]
    player.minorHand = ['B065_GrainDepot']
    player.resources.wood = 2
    player.resources.clay = 2
    player.resources.stone = 2

    const request = playImprovement(state, player, 'minor:B065_GrainDepot', 'any')
    const options = expectPaymentRequest(request)
    const free = options.find((option) => hasPaidResources(option, {}))
    expect(free?.labelParams.sourceCards).toEqual([HOOK_CARD])

    const result = playImprovement(state, player, free!.value, 'any')

    expect(result.type).toBe('flow')
    expect(result).toMatchObject({ type: 'flow', flow: { actionId: 'future-meeples', params: { __futureMeepleRequest: {
      cardId: 'B065_GrainDepot', count: 3, resources: { grain: 1 },
    } } } })
    expect(state.pendingFutureMeeples).toEqual([])
  })

  // ADR 0004 closure property on production impls: A27 (mandatory fixed
  // price) + A143 (optional stone discount). Mandatory Saturation hides the
  // printed oven row; only the fixed row and its discounted derivation
  // surface, independent of which zone arrays the cards sit in.
  it('A27+A143 surfaces only the saturated fixed-price rows', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.minorPlayed = ['A027_OvenSite']
    player.occupationPlayed = ['A143_Stonecutter']

    const result = resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_ClayOven',
      { clay: 3 },
      'A027_OvenSite',
    )
    expect(sortedJson(candidateOptions(result).map((row) => row.resources))).toEqual(sortedJson([
      { clay: 1, stone: 1 },
      { clay: 1 },
    ]))
  })

  it('A75+D117 preserves the base, A75-discounted, and D117 wood-for-food candidates', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    player.minorPlayed = ['A075_LumberMill']
    player.occupationPlayed = ['D117_WoodExpert']

    const result = resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_Test',
      { wood: 2 },
    )
    expect(sortedJson(candidateOptions(result))).toEqual(sortedJson([
      { resources: { wood: 2 }, sources: [] },
      { resources: { wood: 1 }, sources: ['A075_LumberMill'] },
      { resources: { food: 1 }, sources: ['D117_WoodExpert'] },
    ]))
  })
})
