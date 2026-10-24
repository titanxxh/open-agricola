import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../../session/state-bootstrap'
import { EventStore } from '../../../events/store'
import { payAction } from '../pay'

describe('seasonal payment settlement', () => {
  it.each([-2, 0])('settles an empty payment with a seasonal cost delta of %i', wood => {
    const state = createInitialState(353, { playerCount: 2 })
    const player = state.players[0]!
    const before = structuredClone(player)
    const events = new EventStore()
    const frame = events.beginFrame({ actorPlayerId: player.id })
    const result = payAction.execute({
      state, player, space: state.actionSpaces[0]!, actionHooks: undefined, eventSink: frame.sink,
      params: { cost: {}, costType: 'fencing', paymentId: 'reserved-spring-payment',
        seasonalAdjustments: [{ season: 'spring', resources: { wood } }] },
    })
    expect(result.type).toBe('ok')
    expect(player).toEqual(before)
    const settled = frame.complete(state)
    if (wood === 0) {
      expect(settled).toEqual([])
      expect(result.type === 'ok' && result.extraData?.publicPayment).toEqual({ resources: {} })
    } else {
      expect(settled).toEqual([expect.objectContaining({ type: 'resource.paid', resources: {},
        paymentId: 'reserved-spring-payment',
        seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }] })])
      expect(result.type === 'ok' && result.extraData?.publicPayment).toMatchObject({
        paymentId: 'reserved-spring-payment',
        resources: {}, seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }],
      })
    }
  })
})
