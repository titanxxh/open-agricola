import { arch, cpus, platform, release } from 'node:os'
import { describe, expect, it } from 'vitest'
import { PaymentSolver } from '../shared/actions/payment'
import type { Cost, Option, PaymentCtx } from '../shared/actions/payment'
import type { CostModifier, GameState, Resource } from '../shared/contract/types'

const benchmarkIt = process.env.RUN_BENCHMARKS === '1' ? it : it.skip
const samples = 20

const makeState = (
  resources: Partial<Resource>,
  activeModifiers: CostModifier[] = [],
): GameState => ({
  players: [{
    id: 'p1',
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
      ...resources,
    },
    rooms: 2,
    houseType: 'clay',
    activeModifiers,
  }],
} as unknown as GameState)

type Scenario = {
  name: string
  state: GameState
  cost: Cost
  ctx: PaymentCtx
  expected: Option[]
  modes: ('simple-fast-path' | 'cold' | 'warm')[]
}

const scenarios: Scenario[] = [
  {
    name: 'simple fast path',
    state: makeState({ wood: 5 }),
    cost: { wood: 3 },
    ctx: { actionId: 'bench-simple', costType: 'none' },
    expected: [{ resourcesPaid: { wood: 3 }, tradesUsed: [] }],
    modes: ['simple-fast-path'],
  },
  {
    name: 'complex fees, trades, and bonuses',
    state: makeState({ food: 6 }),
    cost: {
      fees: [{ wood: 3, reed: 1 }, { clay: 3, stone: 1 }],
      trades: [{
        from: { food: 2 },
        to: { wood: 1 },
        max: 3,
        scope: 'action',
        source: 'bench-food-for-wood',
      }],
      bonuses: [{
        discount: { reed: 1 },
        optional: false,
        sources: ['bench-reed-discount'],
      }],
    },
    ctx: { actionId: 'bench-complex', costType: 'none' },
    expected: [{
      resourcesPaid: { food: 6 },
      tradesUsed: [{
        trade: {
          from: { food: 2 },
          to: { wood: 1 },
          max: 3,
          scope: 'action',
          source: 'bench-food-for-wood',
        },
        times: 3,
      }],
      bonusUsed: 'bench-reed-discount',
      bonusReductions: { 'bench-reed-discount': { reed: 1 } },
      feeIndex: 0,
    }],
    modes: ['cold', 'warm'],
  },
  {
    name: 'remove resource with unit-scoped trade',
    state: makeState(
      { wood: 2, stone: 1 },
      [
        {
          type: 'remove-resource',
          cardId: 'C014_StrawThatchedRoof',
          appliesTo: ['construct'],
          resources: ['reed'],
        },
        {
          type: 'trade',
          cardId: 'A123_FrameBuilder',
          appliesTo: ['construct'],
          from: { wood: 1 },
          to: { clay: 2 },
          scope: 'unit',
        },
      ],
    ),
    cost: {
      fee: { stone: 1, reed: 1 },
      unitFee: { clay: 2, reed: 1 },
      nb: 2,
    },
    ctx: { actionId: 'bench-unit', costType: 'construct' },
    expected: [{
      resourcesPaid: { stone: 1, wood: 2 },
      tradesUsed: [{
        trade: {
          from: { wood: 1 },
          to: { clay: 2 },
          scope: 'unit',
          source: 'A123_FrameBuilder',
          sourceId: 'A123_FrameBuilder',
        },
        times: 2,
      }],
      bonusUsed: 'C014_StrawThatchedRoof',
      bonusReductions: { C014_StrawThatchedRoof: { reed: 3 } },
    }],
    modes: ['cold', 'warm'],
  },
]

const compute = (scenario: Scenario): Option[] =>
  PaymentSolver.computeOptions(scenario.state, 0, scenario.cost, scenario.ctx)

const verify = (scenario: Scenario): void => {
  PaymentSolver.clearCache()
  const options = compute(scenario)
  expect(options).toHaveLength(scenario.expected.length)
  expect(options).toMatchObject(scenario.expected)
}

const measure = (scenario: Scenario, mode: Scenario['modes'][number]) => {
  const calls = mode === 'cold' ? 50 : 1_000
  if (mode === 'warm') {
    PaymentSolver.clearCache()
    compute(scenario)
  }
  const timings = Array.from({ length: samples }, () => {
    if (mode === 'cold') {
      let elapsed = 0
      for (let call = 0; call < calls; call += 1) {
        PaymentSolver.clearCache()
        const started = performance.now()
        compute(scenario)
        elapsed += performance.now() - started
      }
      return elapsed / calls
    }
    const started = performance.now()
    for (let call = 0; call < calls; call += 1) compute(scenario)
    return (performance.now() - started) / calls
  }).sort((left, right) => left - right)
  return {
    scenario: scenario.name,
    mode,
    calls,
    median: timings[Math.floor(timings.length / 2)] ?? 0,
    min: timings[0] ?? 0,
    max: timings.at(-1) ?? 0,
  }
}

describe.sequential('production PaymentSolver benchmark', () => {
  it.each(scenarios)('returns expected solutions: $name', (scenario) => {
    verify(scenario)
  })

  benchmarkIt('reports latency without enforcing a timing threshold', () => {
    for (const scenario of scenarios) verify(scenario)
    const rows = scenarios.flatMap((scenario) =>
      scenario.modes.map((mode) => measure(scenario, mode)),
    )
    const cpu = cpus()[0]?.model ?? 'unknown CPU'
    console.log(
      `\nNode ${process.version} | ${platform()} ${release()} ${arch()} | ${cpu} | ${samples} samples`,
    )
    for (const row of rows) {
      console.log(
        `${row.scenario} [${row.mode}] ${row.calls} calls/sample: ` +
          `median ${row.median.toFixed(6)} ms/op, ` +
          `min ${row.min.toFixed(6)}, max ${row.max.toFixed(6)}`,
      )
    }
  })
})
