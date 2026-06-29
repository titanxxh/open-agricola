import { describe, it, expect } from 'vitest'
import { recordPaymentStats } from '../payment-stats'
import { readCardResourceStats } from '../card-state'
import type { PlayerState, PaymentSolution, Trade } from '../../../contract/types'

const mockPlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} } as unknown as PlayerState)

const trade = (overrides: Partial<Trade>): Trade => ({
  from: {},
  to: {},
  sourceId: undefined,
  ...overrides,
} as Trade)

describe('recordPaymentStats', () => {
  it('attributes saved + paid to a single trade source', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 1 },
      tradesUsed: [
        { trade: trade({ from: { wood: 2 }, to: { stone: 1 }, sourceId: 'C88' }), times: 1 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    }
    recordPaymentStats(player, solution)
    const stats = readCardResourceStats(player, 'C88')
    expect(stats?.saved).toEqual({ wood: 2 })
    expect(stats?.paid).toEqual({ stone: 1 })
  })

  it('multiplies trade by times', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 3 },
      tradesUsed: [
        { trade: trade({ from: { wood: 2 }, to: { stone: 1 }, sourceId: 'C16' }), times: 3 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    }
    recordPaymentStats(player, solution)
    const stats = readCardResourceStats(player, 'C16')
    expect(stats?.saved).toEqual({ wood: 6 })
    expect(stats?.paid).toEqual({ stone: 3 })
  })

  it('attributes empty-from trades as pure saved resources', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { clay: 4, reed: 2 },
      tradesUsed: [
        { trade: trade({ from: {}, to: { clay: 1 }, sourceId: 'A128_RiparianBuilder' }), times: 1 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    }
    recordPaymentStats(player, solution)
    const stats = readCardResourceStats(player, 'A128_RiparianBuilder')
    expect(stats?.saved).toEqual({ clay: 1 })
    expect(stats?.paid).toEqual({})
  })

  it('ignores trades without sourceId (engine-internal trades)', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 1 },
      tradesUsed: [
        { trade: trade({ from: { wood: 2 }, to: { stone: 1 } }), times: 1 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    }
    recordPaymentStats(player, solution)
    expect(player.cardStates).toEqual({})
  })

  it('attributes bonusUsed sources via comma-separated card ids', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: {},
      tradesUsed: [],
      bonusUsed: 'E016_BriarHedge',
      cardUsed: undefined,
    }
    recordPaymentStats(player, solution, { 'E016_BriarHedge': { wood: 1 } })
    expect(readCardResourceStats(player, 'E016_BriarHedge')?.saved).toEqual({ wood: 1 })
  })

  it('multiple trades from different cards stack independently', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 1, food: 1 },
      tradesUsed: [
        { trade: trade({ from: { wood: 1 }, to: { stone: 1 }, sourceId: 'C88' }), times: 1 },
        { trade: trade({ from: { reed: 1 }, to: { food: 1 }, sourceId: 'C16' }), times: 1 },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    }
    recordPaymentStats(player, solution)
    expect(readCardResourceStats(player, 'C88')?.saved).toEqual({ wood: 1 })
    expect(readCardResourceStats(player, 'C16')?.saved).toEqual({ reed: 1 })
  })
})
