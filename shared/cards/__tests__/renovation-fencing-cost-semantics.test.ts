import { describe, expect, it } from 'vitest'
import type {
  ActionSpace,
  Bonus,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
  Resource,
  Trade,
} from '../../contract/types'
import { buildRenovationPlan } from '../../actions/effects/renovation'
import { computeAllBuyableCombinations } from '../../actions/payment/internal'
import { runCardListeners } from '../card-listeners'
import { getCardModifiers } from '../card-modifiers'
import './setup-register-all'

type PlayedZone = 'occupationPlayed' | 'minorPlayed'

type CostCase = {
  name: string
  cardId: string
  zone: PlayedZone
  kind: 'renovation' | 'fencing'
  houseType?: PlayerState['houseType']
  rooms?: number
  target?: 'clay' | 'stone'
  sourceCard?: string
  spaceId?: string
  expected: PaymentOption[]
}

type PaymentOption = {
  resources: PaymentResourceMap
  sources: string[]
}

type ActionAdjustments = {
  costs: Partial<Resource>
  bonuses: Bonus[]
  trades: Trade[]
}

const baseResources: Resource = {
  wood: 20,
  clay: 20,
  reed: 20,
  stone: 20,
  food: 20,
  grain: 20,
  vegetable: 20,
  sheep: 20,
  boar: 20,
  cattle: 20,
  begging: 0,
}

const makePlayer = (cardId: string, zone: PlayedZone, houseType: PlayerState['houseType'], rooms: number): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: { ...baseResources },
  workers: [],
  rooms,
  houseType,
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: zone === 'minorPlayed' ? [cardId] : [],
  occupationHand: [],
  occupationPlayed: zone === 'occupationPlayed' ? [cardId] : [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [...getCardModifiers(cardId)],
  cardStates: {},
} as unknown as PlayerState)

const makeState = (player: PlayerState): GameState => ({
  round: 5,
  players: [player],
  currentPlayerIndex: 0,
  actionSpaces: [],
} as unknown as GameState)

const makeSpace = (id: string): ActionSpace => ({
  id,
  resources: {},
} as unknown as ActionSpace)

const mergeResourceDelta = (
  base: PaymentResourceMap,
  delta: Partial<Resource>,
): PaymentResourceMap => {
  const out: PaymentResourceMap = { ...base }
  for (const [key, value] of Object.entries(delta)) {
    if (typeof value !== 'number' || value === 0) continue
    const resourceKey = key as keyof Resource
    out[resourceKey] = (out[resourceKey] ?? 0) + value
  }
  return out
}

const appendAdjustments = (cost: ComplexCost, adjustments: ActionAdjustments): ComplexCost => {
  const next: ComplexCost = { ...cost }
  if (adjustments.trades.length > 0) next.trades = [...(next.trades ?? []), ...adjustments.trades]
  if (adjustments.bonuses.length > 0) next.bonuses = [...(next.bonuses ?? []), ...adjustments.bonuses]
  return next
}

const collectActionAdjustments = (
  scenario: CostCase,
  state: GameState,
  player: PlayerState,
): ActionAdjustments => {
  const params = scenario.target ? { selectedOption: scenario.target } : undefined
  const results = runCardListeners({
    state,
    player,
    space: makeSpace(scenario.spaceId ?? scenario.kind),
    actionId: scenario.kind === 'renovation' ? 'renovate-house' : 'fence',
    phase: 'computeCosts',
    sourceCard: scenario.sourceCard,
    params,
  })
  const costs: Partial<Resource> = {}
  const bonuses: Bonus[] = []
  const trades: Trade[] = []
  for (const result of results) {
    if (result.costs) {
      for (const [key, value] of Object.entries(result.costs)) {
        if (typeof value !== 'number') continue
        const resourceKey = key as keyof Resource
        costs[resourceKey] = (costs[resourceKey] ?? 0) + value
      }
    }
    if (result.bonuses) bonuses.push(...result.bonuses)
    if (result.trades) trades.push(...result.trades)
  }
  return { costs, bonuses, trades }
}

const buildCost = (
  scenario: CostCase,
  state: GameState,
  player: PlayerState,
): ComplexCost => {
  const adjustments = collectActionAdjustments(scenario, state, player)
  if (scenario.kind === 'renovation') {
    const plan = buildRenovationPlan(player, scenario.target ?? 'clay')
    expect(plan, scenario.name).not.toBeNull()
    return appendAdjustments({
      ...plan!.cost,
      fees: [mergeResourceDelta(plan!.cost.fees?.[0] ?? {}, adjustments.costs)],
    }, adjustments)
  }
  return appendAdjustments({
    fees: Object.keys(adjustments.costs).length > 0 ? [adjustments.costs] : undefined,
    unitFee: { wood: 1 },
    nb: 1,
  }, adjustments)
}

const positiveResources = (resources: PaymentResourceMap): PaymentResourceMap => {
  const out: PaymentResourceMap = {}
  for (const [key, value] of Object.entries(resources)) {
    if (typeof value === 'number' && value > 0) {
      out[key as keyof PaymentResourceMap] = value
    }
  }
  return out
}

const solutionSources = (solution: PaymentSolution): string[] => {
  const sources = new Set<string>()
  for (const entry of solution.tradesUsed) {
    if (entry.times <= 0) continue
    const source = entry.trade.sourceId ?? entry.trade.source
    if (source) sources.add(source)
  }
  for (const source of solution.bonusUsed?.split(',') ?? []) {
    if (source) sources.add(source)
  }
  return [...sources].sort()
}

const optionKey = (option: PaymentOption): string =>
  JSON.stringify({ resources: option.resources, sources: option.sources })

const paymentOptions = (scenario: CostCase): PaymentOption[] => {
  const player = makePlayer(
    scenario.cardId,
    scenario.zone,
    scenario.houseType ?? 'wood',
    scenario.rooms ?? 3,
  )
  const state = makeState(player)
  const cost = buildCost(scenario, state, player)
  const costType: CostModifierType = scenario.kind
  return computeAllBuyableCombinations(player, cost, undefined, costType, state)
    .map((solution) => ({
      resources: positiveResources(solution.resourcesPaid),
      sources: solutionSources(solution),
    }))
    .sort((left, right) => optionKey(left).localeCompare(optionKey(right)))
}

const cases: CostCase[] = [
  {
    name: 'Stonecutter renovation discount is mandatory',
    cardId: 'A143_Stonecutter',
    zone: 'occupationPlayed',
    kind: 'renovation',
    target: 'stone',
    expected: [{ resources: { reed: 1, stone: 2 }, sources: ['A143_Stonecutter'] }],
  },
  {
    name: 'Bricklayer renovation discount is mandatory',
    cardId: 'C122_Bricklayer',
    zone: 'occupationPlayed',
    kind: 'renovation',
    target: 'clay',
    expected: [{ resources: { clay: 2, reed: 1 }, sources: ['C122_Bricklayer'] }],
  },
  {
    name: 'Wood Slide Hammer stone renovation discount is mandatory',
    cardId: 'C13_WoodSlideHammer',
    zone: 'minorPlayed',
    kind: 'renovation',
    rooms: 5,
    target: 'stone',
    expected: [{ resources: { reed: 1, stone: 3 }, sources: ['C13_WoodSlideHammer'] }],
  },
  {
    name: 'Plumber uses the selected renovation target and offers both sourced discounts',
    cardId: 'B128_Plumber',
    zone: 'occupationPlayed',
    kind: 'renovation',
    target: 'stone',
    sourceCard: 'B128_Plumber',
    expected: [
      { resources: { reed: 1, stone: 1 }, sources: ['B128_Plumber'] },
      { resources: { reed: 1, stone: 2 }, sources: ['B128_Plumber'] },
    ],
  },
  {
    name: 'Clay Plasterer sources its fixed clay renovation cost',
    cardId: 'D121_ClayPlasterer',
    zone: 'occupationPlayed',
    kind: 'renovation',
    target: 'clay',
    expected: [{ resources: { clay: 1, reed: 1 }, sources: ['D121_ClayPlasterer'] }],
  },
  {
    name: 'Trowel sources its wood to stone fixed renovation cost',
    cardId: 'D13_Trowel',
    zone: 'minorPlayed',
    kind: 'renovation',
    target: 'stone',
    sourceCard: 'D13_Trowel',
    expected: [{ resources: { reed: 3, stone: 3, food: 3 }, sources: ['D13_Trowel'] }],
  },
  {
    name: 'Chimney Sweep sources its stone renovation discount',
    cardId: 'D154_ChimneySweep',
    zone: 'occupationPlayed',
    kind: 'renovation',
    target: 'stone',
    expected: [{ resources: { reed: 1, stone: 1 }, sources: ['D154_ChimneySweep'] }],
  },
  {
    name: 'Roof Ladder sources its reed renovation discount',
    cardId: 'D81_RoofLadder',
    zone: 'minorPlayed',
    kind: 'renovation',
    target: 'clay',
    expected: [{ resources: { clay: 3 }, sources: ['D81_RoofLadder'] }],
  },
  {
    name: 'Hunting Trophy keeps the original Farm Redevelopment fence cost and adds a sourced discount',
    cardId: 'D82_HuntingTrophy',
    zone: 'minorPlayed',
    kind: 'fencing',
    spaceId: 'farm-redevelopment',
    expected: [
      { resources: {}, sources: ['D82_HuntingTrophy'] },
      { resources: { wood: 1 }, sources: [] },
    ],
  },
]

describe('renovation and fencing cost semantics', () => {
  it.each(cases)('$name', (scenario) => {
    expect(paymentOptions(scenario)).toEqual(
      [...scenario.expected].sort((left, right) => optionKey(left).localeCompare(optionKey(right))),
    )
  })
})
