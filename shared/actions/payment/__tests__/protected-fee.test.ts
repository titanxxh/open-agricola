import { describe, expect, it } from 'vitest'
import { PaymentSolver } from '..'
import { createInitialState } from '../../../session/state-bootstrap'
import { installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'
import type { ComplexCost } from '../../../contract/types'

installOfficialCardRegistry()
const paid = (cost: ComplexCost, wood: number) => {
  const state = createInitialState(1629, { playerCount: 2 })
  state.players[0]!.resources.wood = wood
  return PaymentSolver.computeOptions(state, 0, cost, { actionId: 'fence', costType: 'fencing' })
    .map(solution => Object.fromEntries(Object.entries(solution.resourcesPaid).filter(([, amount]) => (amount ?? 0) > 0)))
}

describe('protected payment fees', () => {
  it('adds a fee after a mandatory full discount rather than rejecting a zero ordinary price', () => {
    const cost: ComplexCost = { fee: { wood: 4 }, protectedFee: { wood: 2 }, bonuses: [{ discount: { wood: 99 }, capDiscountAtCost: true, optional: false, sources: ['discount'] }] }
    expect(paid(cost, 2)).toEqual([{ wood: 2 }])
    expect(paid(cost, 1)).toEqual([])
  })
  it('clamps an oversized action discount to the ordinary debt without spending the protected fee', () => {
    const cost: ComplexCost = { fee: { wood: 2 }, protectedFee: { wood: 2 }, trades: [{ from: {}, to: { wood: 3 }, scope: 'action', max: 1 }] }
    expect(paid(cost, 2)).toEqual([{ wood: 2 }])
    expect(paid(cost, 1)).toEqual([])
  })
  it('applies the payment budget to the complete price', () => {
    expect(paid({ fee: { wood: 0 }, protectedFee: { wood: 2 }, paymentBudget: { wood: 1 } }, 10)).toEqual([])
    expect(paid({ fee: { wood: 0 }, protectedFee: { wood: 2 }, paymentBudget: { wood: 2 } }, 10)).toEqual([{ wood: 2 }])
  })
  it.each([false, true])('keeps the fee when a card is returned (required: %s)', required => {
    const state = createInitialState(1629, { playerCount: 2 })
    state.players[0]!.resources.wood = 3
    const cost: ComplexCost = { fee: { wood: 4 }, protectedFee: { wood: 2 },
      bonuses: [{ discount: { wood: 4 }, optional: false }],
      cards: { type: 'Major', list: ['Major_Fireplace1'], cost: { wood: 1 }, required },
    }
    const options = PaymentSolver.computeOptions(state, 0, cost, { actionId: 'fence', costType: 'fencing', playedCards: ['Major_Fireplace1'] })
    expect(options.filter(option => option.cardUsed).map(option => option.resourcesPaid.wood)).toEqual([3])
  })
  it('allows live card-provided wood to pay the protected part without charging it twice', () => {
    const state = createInitialState(1629, { playerCount: 2 })
    state.players[0]!.resources.wood = 1
    const forest = state.actionSpaces.find(space => space.id === 'forest')
    if (!forest) throw new Error('missing forest')
    forest.resources.wood = 1
    const cost: ComplexCost = { fee: { wood: 4 }, protectedFee: { wood: 2 }, bonuses: [{ discount: { wood: 99 }, capDiscountAtCost: true, optional: false }], paymentResourceProviders: [{
      key: 'test:wood', sourceCard: '__test_wood_provider__', available: 1, covers: [{ resource: 'wood', costAmount: 1, paymentAmount: 1 }],
      consume: { type: 'actionSpace', spaceId: 'forest', resource: 'wood' },
    }] }
    const solutions = PaymentSolver.computeOptions(state, 0, cost, { actionId: 'fence', costType: 'fencing' })
    expect(solutions.map(solution => Object.fromEntries(Object.entries(solution.resourcesPaid).filter(([, amount]) => (amount ?? 0) > 0))))
      .toEqual([{ wood: 1, 'test:wood': 1 }])
    forest.resources.wood = 0
    expect(PaymentSolver.computeOptions(state, 0, cost, { actionId: 'fence', costType: 'fencing' })).toEqual([])
  })
})
