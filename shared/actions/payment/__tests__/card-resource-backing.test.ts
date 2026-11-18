import { describe, expect, it } from 'vitest'
import { PaymentSolver } from '..'
import { createInitialState } from '../../../session/state-bootstrap'
import { installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'
import type { ComplexCost } from '../../../contract/types'

installOfficialCardRegistry()

const fixture = () => {
  const state = createInitialState(61052, { playerCount: 4 })
  const player = state.players[0]!
  player.resources.food = 0
  player.cardStates.__test_store__ = { counters: { food: 2 } }
  const cost: ComplexCost = {
    fee: { food: 2 },
    paymentResourceProviders: [
      {
        key: 'test:stored-food',
        sourceCard: '__test_store__',
        available: 2,
        covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }],
        consume: { type: 'card', playerId: player.id, cardId: '__test_store__', resource: 'food' },
      },
    ],
  }
  return { state, player, cost }
}
const ctx = { actionId: 'pay', costType: 'occupation' as const }

describe('card-backed payment resources', () => {
  it('spends only stored goods and returns the real card source in its receipt', () => {
    const { state, player, cost } = fixture()
    const result = PaymentSolver.resolvePayment(state, 0, cost, ctx)
    expect(result.type).toBe('paid')
    expect(player.cardStates.__test_store__!.counters!.food).toBe(0)
    expect(player.resources.food).toBe(0)
    if (result.type === 'paid')
      expect(result.receipt).toMatchObject({
        resourcesPaid: { 'test:stored-food': 2 },
        paymentResourceProviders: cost.paymentResourceProviders,
      })
  })
  it('rejects a stale balance without taking other goods', () => {
    const { state, player, cost } = fixture()
    expect(PaymentSolver.computeOptions(state, 0, cost, ctx)).toHaveLength(1)
    player.cardStates.__test_store__!.counters!.food = 1
    expect(PaymentSolver.resolvePayment(state, 0, cost, ctx).type).toBe('failed')
    expect(player.cardStates.__test_store__!.counters!.food).toBe(1)
    expect(player.resources.food).toBe(0)
  })
  it('cannot spend a shared card balance twice through aliases', () => {
    const { state, cost } = fixture()
    cost.fee = { food: 3 }
    cost.paymentResourceProviders!.push({
      ...cost.paymentResourceProviders![0]!,
      key: 'test:second-alias',
    })
    expect(PaymentSolver.computeOptions(state, 0, cost, ctx)).toEqual([])
  })
  it('transfers a protected fee exactly once with the successful payment', () => {
    const { state, player } = fixture()
    player.resources.food = 1
    const recipient = state.players[1]!
    recipient.resources.food = 0
    const cost: ComplexCost = {
      fee: { food: 4 },
      protectedFee: { food: 1 },
      bonuses: [{ discount: { food: 4 }, optional: false }],
      paymentTransfers: [
        { recipientPlayerId: recipient.id, resources: { food: 1 }, sourceCard: '__test_toll__' },
      ],
    }
    expect(PaymentSolver.resolvePayment(state, 0, cost, ctx).type).toBe('paid')
    expect(player.resources.food).toBe(0)
    expect(recipient.resources.food).toBe(1)
    expect(PaymentSolver.resolvePayment(state, 0, cost, ctx).type).toBe('failed')
    expect(recipient.resources.food).toBe(1)
  })
  it('does not deduct a fee when its recipient no longer exists', () => {
    const { state, player } = fixture()
    player.resources.food = 1
    const cost: ComplexCost = {
      fee: { food: 1 },
      paymentTransfers: [
        { recipientPlayerId: 'missing', sourceCard: '__test_toll__', resources: { food: 1 } },
      ],
    }
    expect(PaymentSolver.resolvePayment(state, 0, cost, ctx).type).toBe('failed')
    expect(player.resources.food).toBe(1)
  })
})
