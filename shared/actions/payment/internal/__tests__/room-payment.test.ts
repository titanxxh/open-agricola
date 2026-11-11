import { describe, expect, it } from 'vitest'
import { computeAllBuyableCombinations } from '../enumerate'
import { createInitialState } from '../../../../session/state-bootstrap'
import { installOfficialCardRegistry } from '../../../../cards/__tests__/card-environment'
import type { ComplexCost, CostModifier, PaymentSolution, PlayerState, Resource, Trade } from '../../../../contract/types'

installOfficialCardRegistry()

const nonZeroPaid = (sol: PaymentSolution): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const [k, v] of Object.entries(sol.resourcesPaid)) {
    if ((v ?? 0) !== 0) out[k as keyof Resource] = v
  }
  return out
}

const makePlayer = (modifiers: CostModifier[], houseType: 'wood' | 'clay' | 'stone' = 'clay'): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: { wood: 99, clay: 99, reed: 99, stone: 99, food: 99, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  workers: [], rooms: 1, houseType, fields: [], roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [], occupationHand: [], occupationPlayed: [],
  extraOccupationsFromCards: [], playedCards: [],
  houseAnimals: {}, stableAnimals: {}, pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false, activeModifiers: modifiers, cardStates: {},
  stats: {} as never,
})

describe('construct cost via unified enumerate', () => {
  it('Clay Supports provides an independent complete room price', () => {
    const player = makePlayer([{
      type: 'trade', cardId: 'D015_ClaySupports', appliesTo: ['construct'],
      scope: 'unit',
      from: {}, to: {}, unitPrice: { clay: 2, wood: 1, reed: 1 },
    }])
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )
    expect(sols.length).toBeGreaterThanOrEqual(2)
    const swapped = sols.find((s) => s.tradesUsed.some((t) => t.times > 0))
    const noSwap = sols.find((s) => s.tradesUsed.every((t) => t.times === 0))
    expect(swapped && nonZeroPaid(swapped)).toEqual({ clay: 2, reed: 1, wood: 1 })
    expect(noSwap && nonZeroPaid(noSwap)).toEqual({ clay: 5, reed: 2 })
  })

  it('each room chooses the Supports base once', () => {
    const player = makePlayer([{
      type: 'trade', cardId: 'D015_ClaySupports', appliesTo: ['construct'],
      scope: 'unit',
      from: {}, to: {}, unitPrice: { clay: 2, wood: 1, reed: 1 },
    }])
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )
    sols.forEach((s) => {
      const totalUnitSwaps = s.tradesUsed.reduce((acc, t) => acc + t.times, 0)
      expect(totalUnitSwaps).toBeLessThanOrEqual(1)
    })
  })

  it('A123 FrameBuilder and B145 BrushwoodCollector can stack on one clay room', () => {
    const player = makePlayer([
      {
        type: 'trade', cardId: 'B145_BrushwoodCollector', appliesTo: ['construct'],
        scope: 'unit', order: 20, replaceUpTo: true, from: { wood: 1 }, to: { reed: 2 },
      },
      {
        type: 'trade', cardId: 'A123_FrameBuilder', appliesTo: ['construct'],
        scope: 'unit', order: 30, from: { wood: 1 }, to: { clay: 2 },
      },
    ])
    player.resources = {
      wood: 2, clay: 3, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }

    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )

    expect(sols.some((s) => {
      const paid = nonZeroPaid(s)
      return paid.clay === 3 && paid.wood === 2 && paid.reed === undefined
    })).toBe(true)
  })

  it('D15 ClaySupports and B145 BrushwoodCollector can stack on one clay room', () => {
    const player = makePlayer([
      {
        type: 'trade', cardId: 'D015_ClaySupports', appliesTo: ['construct'],
        scope: 'unit', order: 10, from: {}, to: {}, unitPrice: { clay: 2, wood: 1, reed: 1 },
      },
      {
        type: 'trade', cardId: 'B145_BrushwoodCollector', appliesTo: ['construct'],
        scope: 'unit', order: 20, replaceUpTo: true, from: { wood: 1 }, to: { reed: 2 },
      },
    ])
    player.resources = {
      wood: 2, clay: 2, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }

    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )

    expect(sols.some((s) => {
      const paid = nonZeroPaid(s)
      return paid.clay === 2 && paid.wood === 2 && paid.reed === undefined
    })).toBe(true)
  })
})


describe('complete unit price boundaries', () => {
  const price: Trade = { sourceId: 'price', scope: 'unit', from: {}, to: {}, unitPrice: { wood: 2, reed: 2 } }
  const quote = (cost: ComplexCost) => computeAllBuyableCombinations(makePlayer([], 'wood'), cost, undefined, 'construct')

  it.each([false, true])('chooses one base before transformations regardless of registration order: %s', reverse => {
    const trades: Trade[] = [
      price,
      { sourceId: 'other-price', scope: 'unit', from: {}, to: {}, unitPrice: { wood: 3, reed: 1 } },
      { sourceId: 'discount', scope: 'unit', from: {}, to: { wood: 1 }, replaceUpTo: true },
    ]
    const solutions = quote({ unitFee: { wood: 5, reed: 2 }, nb: 1, trades: reverse ? trades.reverse() : trades })
    expect(solutions.map(nonZeroPaid)).toEqual(expect.arrayContaining([{ wood: 1, reed: 2 }, { wood: 2, reed: 1 }]))
    expect(solutions.some(solution => (solution.resourcesPaid.wood ?? 0) === 0)).toBe(false)
    const selected = solutions.find(solution => solution.resourcesPaid.wood === 1)
    expect(selected?.tradesUsed.map(use => use.trade.sourceId).sort()).toEqual(['discount', 'price'])
    expect(selected?.tradesUsed.find(use => use.trade.sourceId === 'price')?.costAttribution).toEqual({ saved: { wood: 3 }, paid: {} })
    expect(selected?.tradesUsed.find(use => use.trade.sourceId === 'discount')?.costAttribution).toEqual({ saved: { wood: 1 } })
  })

  it('limits a price shared across multiple units by its global group', () => {
    const solutions = quote({ unitFee: { wood: 5, reed: 2 }, nb: 2, trades: [{ ...price, groupId: 'once', groupMax: 1 }] })
    expect(solutions.map(nonZeroPaid)).toContainEqual({ wood: 7, reed: 4 })
    expect(solutions.some(solution => (solution.resourcesPaid.wood ?? 0) < 7)).toBe(false)
  })

  it('keeps source-specific free construction outside ordinary alternative prices', () => {
    const solutions = quote({ unitFee: {}, nb: 1, unitPriceAlternatives: false, trades: [price] })
    expect(solutions.map(nonZeroPaid)).toEqual([{}])
    expect(solutions[0]?.tradesUsed).toEqual([])
  })

  it.each(['stable', 'fence'] as const)('preserves the %s supply obligation on an alternative base', token => {
    const state = createInitialState(1636, { playerCount: 2 })
    const player = state.players[0]!
    Object.assign(player.resources, { wood: 20, reed: 20 })
    const solutions = computeAllBuyableCombinations(player, { unitFee: { wood: 5, [token]: 1 }, nb: 2, trades: [price] }, undefined, 'construct', state)
    expect(solutions.some(solution => solution.tradesUsed.length > 0)).toBe(true)
    expect(solutions.every(solution => solution.resourcesPaid[token] === 2)).toBe(true)
  })

  it('removes resources from the alternative base and attributes the actual saving', () => {
    const player = makePlayer([{ type: 'remove-resource', cardId: 'no-reed', appliesTo: ['construct'], resources: ['reed'] }], 'wood')
    const solutions = computeAllBuyableCombinations(player, {
      unitFee: { wood: 5, reed: 2 }, nb: 2, trades: [price],
    }, undefined, 'construct')
    const selected = solutions.find(solution => solution.resourcesPaid.wood === 4)
    expect(selected && nonZeroPaid(selected)).toEqual({ wood: 4 })
    expect(selected?.bonusReductions?.['no-reed']).toEqual({ reed: 4 })
  })
})
