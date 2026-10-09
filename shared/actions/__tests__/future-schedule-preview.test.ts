import { describe, expect, it } from 'vitest'
import { describeFutureSchedule } from '../future-schedule'
import { futureMeeplesAction, queueFutureMeeplesFlow } from '../effects/internal/future-meeples'
import { getNodeDescriptionPreview } from '../../engine/engine-utils'
import { SequenceNode, ActionNode } from '../../engine/nodes'
import { ActionRegistry } from '../../engine/registry'
import { specialEffectAction } from '../effects/special-effect'
import { GameSession } from '../../../server/game/authoritative-session'

describe('executable future request previews', () => {
  it('retains action cost, conditions, room type and duplicate target entries', () => {
    const preview = describeFutureSchedule(1, { cardId: 'test', playerId: 'p1', entries: [
      { round: 3, resources: { field: 1 }, actionContext: { exactCost: { food: 1 } } },
      { round: 4, resources: { field: 1 }, actionContext: { exactCost: { food: 2 } } },
      { round: 5, resources: { food: 1 }, actionContext: { resourceCondition: { kind: 'min-resource', resource: 'horse', amount: 2 } } },
      { round: 5, roomType: 'stone' },
    ] })
    expect(preview).toEqual({ kind: 'futureSchedule', entries: [
      { round: 3, resources: {}, actions: [{ kind: 'field', amount: 1, resourcesPaid: { food: 1 } }] },
      { round: 4, resources: {}, actions: [{ kind: 'field', amount: 1, resourcesPaid: { food: 2 } }] },
      { round: 5, resources: { food: 1 }, resourceCondition: { kind: 'min-resource', resource: 'horse', amount: 2 } },
      { round: 5, resources: {}, roomType: 'stone' },
    ] })
  })

  it('projects consecutive deterministic writes in order for nonlinear source scoring', () => {
    const session = new GameSession(409, undefined, { playerCount: 2 })
    const state = session.state
    const player = state.players[0]!
    player.minorPlayed = ['E038_RodCollection']
    player.cardStates.E038_RodCollection = { extraData: { woodCount: 0 } }
    const registry = new ActionRegistry()
    registry.register(specialEffectAction)
    const node = new SequenceNode('store-twice', [
      new ActionNode('first', 'special-effect', 'E038_RodCollection', { kind: 'increment-extra-data', key: 'woodCount', amount: 1 }),
      new ActionNode('second', 'special-effect', 'E038_RodCollection', { kind: 'increment-extra-data', key: 'woodCount', amount: 1 }),
    ])
    const before = JSON.stringify(state)
    const description = session.withCtx(() => getNodeDescriptionPreview(node, registry, { state, player, space: state.actionSpaces[0]! }))
    expect(description).toMatchObject({ kind: 'group', parts: [
      { effectPreview: { kind: 'cardScore', delta: 0 } }, { effectPreview: { kind: 'cardScore', delta: 1 } },
    ] })
    expect(JSON.stringify(state)).toBe(before)
  })

  it('does not repeat a queued descriptor after the existing drain-all execution', () => {
    const session = new GameSession(409, undefined, { playerCount: 2 })
    const state = session.state
    const player = state.players[0]!
    const flow = queueFutureMeeplesFlow(state, { cardId: 'test', playerId: player.id, startRound: 3, count: 2, resources: { fuel: 1 } })
    if (flow.type !== 'leaf') throw new Error('Expected queue primitive')
    const context = { state, player, space: state.actionSpaces[0]!, params: flow.params }
    const before = JSON.stringify(state)
    expect(futureMeeplesAction.previewEffect?.(context)).toMatchObject({ kind: 'futureSchedule', entries: [{ round: 3, endRound: 4, resources: { fuel: 1 } }] })
    expect(JSON.stringify(state)).toBe(before)
    futureMeeplesAction.execute(context)
    expect(state.pendingFutureMeeples).toHaveLength(0)
    expect(state.futureMeeples).toHaveLength(2)
    expect(futureMeeplesAction.previewEffect?.(context)).toBeUndefined()
  })
})
