import { describe, expect, it, beforeEach } from 'vitest'
import { PaymentSolver } from '../index'
import type { PaymentCtx } from '../index'
import type { GameState, PlayerState } from '../../../contract/types'

const makePlayerWithResources = (res: Partial<Record<string, number>>): PlayerState => {
  return {
    id: 'p1',
    resources: res,
    stableTiles: [],
    fenceSegments: [],
    minorHand: [],
    cardStates: {},
    activeModifiers: [],
    supplyTokensConsumed: {},
  } as unknown as PlayerState
}

const makeState = (player: PlayerState): GameState => ({
  players: [player],
} as unknown as GameState)

const fullStableTiles = () => [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
]

const ctx: PaymentCtx = { actionId: 'test-action', costType: 'none' }

describe('PaymentSolver', () => {
  beforeEach(() => {
    PaymentSolver.clearCache()
  })

  describe('computeOptions', () => {
    it('returns empty array when player cannot afford simple cost', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      expect(options).toEqual([])
    })

    it('returns one option for affordable simple cost', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      expect(options.length).toBe(1)
    })

    it('merges required returned-card cost into resourcesPaid and executes supply token payment', () => {
      const player = makePlayerWithResources({ wood: 2 })
      const state = makeState(player)
      const cardCtx: PaymentCtx = {
        ...ctx,
        playedCards: ['Major_Fireplace1'],
      }
      const cost = {
        fee: { wood: 2 },
        cards: {
          type: 'Major',
          list: ['Major_Fireplace1'],
          cost: { stable: 1 },
          required: true,
        },
      }

      const options = PaymentSolver.computeOptions(state, 0, cost, cardCtx)
      expect(options).toHaveLength(1)
      expect(options[0]).toMatchObject({
        cardUsed: 'Major_Fireplace1',
        resourcesPaid: { wood: 2, stable: 1 },
      })

      const result = PaymentSolver.execute(state, 0, cost, { optionIndex: 0 }, cardCtx)
      expect(result.ok).toBe(true)
      expect(player.resources.wood).toBe(0)
      expect(player.supplyTokensConsumed?.stable).toBe(1)
      expect(player.stableTiles).toHaveLength(0)

      const noReservePlayer = makePlayerWithResources({ wood: 2 })
      noReservePlayer.stableTiles = fullStableTiles()
      const noReserveState = makeState(noReservePlayer)
      const noReserveOptions = PaymentSolver.computeOptions(noReserveState, 0, cost, cardCtx)
      expect(noReserveOptions).toEqual([])
    })

    it('requires stable reserve for optional returned-card supply-token cost', () => {
      const player = makePlayerWithResources({ clay: 0 })
      const state = makeState(player)
      const cardCtx: PaymentCtx = {
        ...ctx,
        playedCards: ['Major_Fireplace1'],
      }
      const cost = {
        fee: { clay: 4 },
        cards: {
          type: 'Major',
          list: ['Major_Fireplace1'],
          cost: { stable: 1 },
        },
      }

      const options = PaymentSolver.computeOptions(state, 0, cost, cardCtx)
      const cardOptionIndex = options.findIndex((option) => option.cardUsed === 'Major_Fireplace1')
      expect(cardOptionIndex).toBeGreaterThanOrEqual(0)
      expect(options[cardOptionIndex]?.resourcesPaid).toEqual({ stable: 1 })

      const result = PaymentSolver.execute(state, 0, cost, { optionIndex: cardOptionIndex }, cardCtx)
      expect(result.ok).toBe(true)
      expect(player.supplyTokensConsumed?.stable).toBe(1)
      expect(player.stableTiles).toHaveLength(0)

      const noReservePlayer = makePlayerWithResources({ clay: 0 })
      noReservePlayer.stableTiles = fullStableTiles()
      const noReserveState = makeState(noReservePlayer)
      const noReserveOptions = PaymentSolver.computeOptions(noReserveState, 0, cost, cardCtx)
      expect(noReserveOptions.some((option) => option.cardUsed === 'Major_Fireplace1')).toBe(false)
    })
  })

  describe('canAfford', () => {
    it('returns false when player cannot afford', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      expect(PaymentSolver.canAfford(state, 0, { wood: 3 }, ctx)).toBe(false)
    })

    it('returns true when player can afford', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      expect(PaymentSolver.canAfford(state, 0, { wood: 3 }, ctx)).toBe(true)
    })

    it('agrees with computeOptions for card-payment cost (D3 cache sharing)', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const ctxWithCards: PaymentCtx = {
        actionId: 'test-card-cost',
        costType: 'none',
        playedCards: ['some-card-id'],
      }
      const complexCost = { fee: { wood: 2 } }
      const optionCount = PaymentSolver.computeOptions(state, 0, complexCost, ctxWithCards).length
      const canAffordResult = PaymentSolver.canAfford(state, 0, complexCost, ctxWithCards)
      expect(canAffordResult).toBe(optionCount > 0)
    })
  })

  describe('execute', () => {
    it('returns ok:true with deducted state on valid choice', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const result = PaymentSolver.execute(state, 0, { wood: 3 }, { optionIndex: 0 }, ctx)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.state.players[0].resources.wood).toBe(2)
      }
    })

    it('returns ok:false reason:invalid-choice for out-of-range index', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const result = PaymentSolver.execute(state, 0, { wood: 3 }, { optionIndex: 99 }, ctx)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('invalid-choice')
      }
    })

    it('returns ok:false reason:cannot-afford when state can no longer pay', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      const result = PaymentSolver.execute(state, 0, { wood: 3 }, { optionIndex: 0 }, ctx)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('cannot-afford')
      }
    })
  })

  describe('pickAuto', () => {
    it('returns the single option when length === 1', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      const auto = PaymentSolver.pickAuto(options)
      expect(auto).toBe(options[0])
    })

    it('returns undefined when length === 0', () => {
      expect(PaymentSolver.pickAuto([])).toBeUndefined()
    })
  })

  describe('clearCache', () => {
    it('exists and is callable', () => {
      expect(() => PaymentSolver.clearCache()).not.toThrow()
    })
  })

  describe('isComplexCost', () => {
    it('returns false for simple Partial<Resource>', () => {
      expect(PaymentSolver.isComplexCost({ wood: 3 })).toBe(false)
    })

    it('returns true for ComplexCost with fee', () => {
      expect(PaymentSolver.isComplexCost({ fee: { wood: 3 } })).toBe(true)
    })

    it('returns true for ComplexCost with cards', () => {
      expect(PaymentSolver.isComplexCost({ cards: { type: 'Major', list: ['K2'], required: true } })).toBe(true)
    })
  })
})
