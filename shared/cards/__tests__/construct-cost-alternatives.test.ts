import { describe, expect, it } from 'vitest'
import type {
  ActionSpace,
  ComplexCost,
  GameState,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../contract/types'
import type { ActionHookResult } from '../../actions/hooks'
import { buildConstructCost, computeAllBuyableCombinations } from '../../actions/payment/internal'
import { runCardListeners } from '../card-listeners'
import './setup-register-all'

type ConstructCase = {
  name: string
  cardId: string
  houseType: PlayerState['houseType']
  round?: number
  sourceCard?: string
  expectedBase: PaymentResourceMap
  expectedAlternative: PaymentResourceMap
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

const makePlayer = (cardId: string, houseType: PlayerState['houseType']): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: { ...baseResources },
  workers: [],
  rooms: 3,
  houseType,
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: cardId === 'B13_CarpentersParlor' ? [cardId] : [],
  occupationHand: [],
  occupationPlayed: cardId === 'B13_CarpentersParlor' ? [] : [cardId],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
} as unknown as PlayerState)

const makeState = (player: PlayerState, round = 5): GameState => ({
  round,
  players: [player],
  currentPlayerIndex: 0,
  actionSpaces: [],
} as unknown as GameState)

const makeSpace = (): ActionSpace => ({
  id: 'construct',
  resources: {},
} as unknown as ActionSpace)

const collectCostResults = (
  state: GameState,
  player: PlayerState,
  sourceCard: string | undefined,
): ActionHookResult[] =>
  runCardListeners({
    state,
    player,
    space: makeSpace(),
    actionId: 'construct',
    phase: 'computeCosts',
    sourceCard,
  })

const mergeCosts = (results: ActionHookResult[]): Partial<Resource> => {
  const costs: Partial<Resource> = {}
  for (const result of results) {
    for (const [key, value] of Object.entries(result.costs ?? {})) {
      if (typeof value !== 'number') continue
      const resourceKey = key as keyof Resource
      costs[resourceKey] = (costs[resourceKey] ?? 0) + value
    }
  }
  return costs
}

const buildCost = (player: PlayerState, results: ActionHookResult[]): ComplexCost => {
  const cost = buildConstructCost(player, mergeCosts(results), 1)
  expect(cost).not.toBeNull()
  return {
    ...cost!,
    trades: results.flatMap((result) => result.trades ?? []),
    bonuses: results.flatMap((result) => result.bonuses ?? []),
  }
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

const optionKey = (option: { resources: PaymentResourceMap; sources: string[] }) =>
  JSON.stringify(option)

const paymentOptions = (player: PlayerState, cost: ComplexCost) =>
  computeAllBuyableCombinations(player, cost, undefined, 'construct')
    .map((solution) => ({
      resources: positiveResources(solution.resourcesPaid),
      sources: solutionSources(solution),
    }))
    .sort((left, right) => optionKey(left).localeCompare(optionKey(right)))

const cases: ConstructCase[] = [
  {
    name: 'A128 Riparian Builder offers the sourced alternative over the original clay-room cost and adds a sourced discount',
    cardId: 'A128_RiparianBuilder',
    houseType: 'clay',
    sourceCard: 'A128_RiparianBuilder',
    expectedBase: { clay: 5, reed: 2 },
    expectedAlternative: { clay: 4, reed: 2 },
  },
  {
    name: 'A149 House Artist offers the sourced alternative over the original wood-room cost and adds a sourced reed discount',
    cardId: 'A149_HouseArtist',
    houseType: 'wood',
    sourceCard: 'A149_HouseArtist',
    expectedBase: { wood: 5, reed: 2 },
    expectedAlternative: { wood: 5, reed: 1 },
  },
  {
    name: 'B126 Carpenter offers the sourced alternative over the original wood-room cost and adds a sourced fixed alternative',
    cardId: 'B126_Carpenter',
    houseType: 'wood',
    expectedBase: { wood: 5, reed: 2 },
    expectedAlternative: { wood: 3, reed: 2 },
  },
  {
    name: "B13 Carpenter's Parlor offers the sourced alternative over the original wood-room cost and adds a sourced fixed alternative",
    cardId: 'B13_CarpentersParlor',
    houseType: 'wood',
    expectedBase: { wood: 5, reed: 2 },
    expectedAlternative: { wood: 2, reed: 2 },
  },
  {
    name: 'C128 Wooden Hut Extender offers the sourced alternative over the original round-8 cost and adds a sourced alternative',
    cardId: 'C128_WoodenHutExtender',
    houseType: 'wood',
    round: 8,
    expectedBase: { wood: 5, reed: 2 },
    expectedAlternative: { wood: 3, reed: 1 },
  },
  {
    name: "C88 Carpenter's Apprentice offers the sourced alternative over the original wood-room cost and adds a sourced discount",
    cardId: 'C88_CarpentersApprentice',
    houseType: 'wood',
    expectedBase: { wood: 5, reed: 2 },
    expectedAlternative: { wood: 3, reed: 2 },
  },
  {
    name: 'D121 Clay Plasterer offers the sourced alternative over the original clay-room cost and adds a sourced fixed alternative',
    cardId: 'D121_ClayPlasterer',
    houseType: 'clay',
    expectedBase: { clay: 5, reed: 2 },
    expectedAlternative: { clay: 3, reed: 2 },
  },
  {
    name: 'E150 Rock Beater offers the sourced alternative over the original stone-room cost and adds a sourced discount',
    cardId: 'E150_RockBeater',
    houseType: 'stone',
    expectedBase: { stone: 5, reed: 2 },
    expectedAlternative: { stone: 3, reed: 2 },
  },
]

describe('construct cost alternatives', () => {
  it.each(cases)('$name', (scenario) => {
    const player = makePlayer(scenario.cardId, scenario.houseType)
    const state = makeState(player, scenario.round)
    const results = collectCostResults(state, player, scenario.sourceCard)
    const options = paymentOptions(player, buildCost(player, results))

    // ADR 0004 amendment: the printed base row only survives when the
    // alternative does not strictly dominate it (replacement-style trades
    // stay Pareto-incomparable; pure discounts hide the base row, like BGA).
    const keys = new Set([
      ...Object.keys(scenario.expectedBase),
      ...Object.keys(scenario.expectedAlternative),
    ]) as Set<keyof PaymentResourceMap>
    const altDominatesBase =
      [...keys].every((key) =>
        (scenario.expectedAlternative[key] ?? 0) <= (scenario.expectedBase[key] ?? 0)) &&
      [...keys].some((key) =>
        (scenario.expectedAlternative[key] ?? 0) < (scenario.expectedBase[key] ?? 0))
    if (altDominatesBase) {
      expect(options).not.toContainEqual({ resources: scenario.expectedBase, sources: [] })
    } else {
      expect(options).toContainEqual({ resources: scenario.expectedBase, sources: [] })
    }
    expect(options).toContainEqual({
      resources: scenario.expectedAlternative,
      sources: [scenario.cardId],
    })
  })
})
