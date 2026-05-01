import { describe, expect, it } from 'vitest'
import { executePaymentSolution } from '../../helpers/payment'
import { readCardResourceStats } from '../../../cards/helpers/card-state'
import type { PaymentSolution, PlayerState } from '../../../game/types'

const mockPlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 5, clay: 0, reed: 0, stone: 5, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    cardStates: {},
  } as unknown as PlayerState)

describe('executePaymentSolution + recordPaymentStats integration', () => {
  it('attributes saved.wood and paid.stone for a single trade source', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 1 },
      tradesUsed: [
        {
          trade: { from: { wood: 2 }, to: { stone: 1 }, sourceId: 'C88_CarpentersApprentice' },
          times: 1,
        },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    }

    executePaymentSolution(player, solution)

    expect(player.resources.stone).toBe(4)
    const stats = readCardResourceStats(player, 'C88_CarpentersApprentice')
    expect(stats?.saved).toEqual({ wood: 2 })
    expect(stats?.paid).toEqual({ stone: 1 })
  })

  it('multiplies saved/paid by times for multi-use trades', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 3 },
      tradesUsed: [
        {
          trade: { from: { wood: 2 }, to: { stone: 1 }, sourceId: 'C16_FieldFences' },
          times: 3,
        },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    }

    executePaymentSolution(player, solution)

    const stats = readCardResourceStats(player, 'C16_FieldFences')
    expect(stats?.saved).toEqual({ wood: 6 })
    expect(stats?.paid).toEqual({ stone: 3 })
  })

  it('skips stat tracking when trackStats=false (e.g. auto-feed)', () => {
    const player = mockPlayer()
    const solution: PaymentSolution = {
      resourcesPaid: { stone: 1 },
      tradesUsed: [
        {
          trade: { from: { wood: 2 }, to: { stone: 1 }, sourceId: 'C88_CarpentersApprentice' },
          times: 1,
        },
      ],
      bonusUsed: undefined,
      cardUsed: undefined,
    }

    executePaymentSolution(player, solution, { trackStats: false })

    expect(player.resources.stone).toBe(4)
    expect(readCardResourceStats(player, 'C88_CarpentersApprentice')).toBeUndefined()
  })
})
