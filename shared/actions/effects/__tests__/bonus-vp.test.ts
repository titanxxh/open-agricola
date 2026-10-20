import { describe, expect, it } from 'vitest'
import type { ActionExecutionContext, GameState, PlayerState } from '../../../contract/types'
import type { EventSink } from '../../../contract/events'
import { bonusVpAction } from '../bonus-vp'
import { ActionNode, SequenceNode } from '../../../engine/nodes'
import { getActionEffectPreview, getSequenceEffectPreview } from '../../../engine/engine-utils'

const CARD_ID = 'B134_HousebookMaster'

const setup = (params?: Record<string, unknown>, actionContext?: Record<string, unknown>) => {
  const actor = { id: 'p1', cardStates: {} } as unknown as PlayerState
  const owner = { id: 'p2', cardStates: {} } as unknown as PlayerState
  const state = { players: [actor, owner] } as unknown as GameState
  const events: unknown[] = []
  const eventSink = { emit: (event: unknown) => { events.push(event) } } as unknown as EventSink
  const context = { state, player: actor, sourceCard: CARD_ID, params, actionContext, eventSink } as unknown as ActionExecutionContext
  return { actor, owner, events, context }
}

const counter = (player: PlayerState) => player.cardStates?.[CARD_ID]?.counters?.bonusVp

describe('bonus-vp effect', () => {
  it('awards params.amount points in one leaf and emits one state change', () => {
    const { actor, events, context } = setup({ amount: 3 })

    expect(bonusVpAction.execute(context)).toEqual({ type: 'ok' })

    expect(counter(actor)).toBe(3)
    expect(events).toEqual([{ type: 'card.stateChanged', cardId: CARD_ID, key: 'bonusVp', targetPlayerId: 'p1' }])
  })

  it('awards one point without params', () => {
    const { actor, context } = setup()

    expect(bonusVpAction.execute(context)).toEqual({ type: 'ok' })
    expect(counter(actor)).toBe(1)
  })

  it('routes the points to targetPlayerId', () => {
    const { actor, owner, events, context } = setup({ amount: 2 }, { targetPlayerId: 'p2' })

    expect(bonusVpAction.execute(context)).toEqual({ type: 'ok' })
    expect(counter(owner)).toBe(2)
    expect(counter(actor)).toBeUndefined()
    expect(events).toEqual([{ type: 'card.stateChanged', cardId: CARD_ID, key: 'bonusVp', targetPlayerId: 'p2' }])
  })

  it.each([0, -1, 1.5, '2', null])('fails closed on amount %p without writing or emitting', (amount) => {
    const { actor, events, context } = setup({ amount })

    expect(bonusVpAction.execute(context)).toMatchObject({ type: 'fail' })
    expect(counter(actor)).toBeUndefined()
    expect(events).toEqual([])
  })
})

describe('bonus-vp choice preview', () => {
  it('previews the leaf amount', () => {
    expect(getActionEffectPreview(new ActionNode('bv', 'bonus-vp', CARD_ID, { amount: 3 })))
      .toEqual({ kind: 'resourceExchange', bonusVp: 3 })
    expect(getActionEffectPreview(new ActionNode('bv', 'bonus-vp', CARD_ID)))
      .toEqual({ kind: 'resourceExchange', bonusVp: 1 })
  })

  it('sums leaf amounts in a pay-then-reward sequence', () => {
    const sequence = new SequenceNode('seq', [
      new ActionNode('pay', 'pay', CARD_ID, { food: 2 }),
      new ActionNode('bv', 'bonus-vp', CARD_ID, { amount: 2 }),
      new ActionNode('bv-2', 'bonus-vp', CARD_ID),
    ])

    expect(getSequenceEffectPreview(sequence)).toMatchObject({
      kind: 'resourceExchange',
      resourcesPaid: { food: 2 },
      bonusVp: 3,
    })
  })

  it('does not preview an invalid amount', () => {
    expect(getActionEffectPreview(new ActionNode('bv', 'bonus-vp', CARD_ID, { amount: 0 }))).toBeUndefined()
    expect(getActionEffectPreview(new ActionNode('bv', 'bonus-vp', CARD_ID, { amount: null }))).toBeUndefined()
    expect(getSequenceEffectPreview(new SequenceNode('seq', [
      new ActionNode('pay', 'pay', CARD_ID, { food: 1 }),
      new ActionNode('bv', 'bonus-vp', CARD_ID, { amount: -1 }),
    ]))).toBeUndefined()
  })
})
