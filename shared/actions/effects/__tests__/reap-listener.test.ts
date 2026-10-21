import { describe, expect, it } from 'vitest'
import { reap, dispatchReapListeners } from '../reap'
import { installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'
import { requireActiveCardRegistry } from '../../../cards/active-registry'
import { createInitialState } from '../../../session/state-bootstrap'
import type { ActionFlow } from '../../../contract/types'

installOfficialCardRegistry()

const IMMEDIATE = 'TEST_ReapImmediate'
const AFTER = 'TEST_ReapAfter'
const activations = (flow: ActionFlow | undefined): ActionFlow[] => {
  if (!flow) return []
  return flow.type === 'leaf' ? [flow] : flow.children.flatMap(activations)
}
function setup(opponent = false) {
  const state = createInitialState(1330, { playerCount: 2 })
  const player = state.players[0]!
  const owner = state.players[opponent ? 1 : 0]!
  owner.minorPlayed = [IMMEDIATE, AFTER]
  const registry = requireActiveCardRegistry('reap-listener-test')
  for (const [cardId, phase] of [[IMMEDIATE, 'immediatelyAfter'], [AFTER, 'after']] as const) {
    registry.registerListener({
      id: cardId, cardIds: [cardId], actions: ['reap'], phases: [phase], scope: opponent ? 'opponent' : 'player',
      handler: () => { throw new Error('Reap planning must not evaluate handlers before their phase runs') },
    })
  }
  return { state, player, owner }
}

describe('Reap reaction planning', () => {
  it('does not create reactions when no crop was harvested', () => {
    const { state, player } = setup()
    expect(dispatchReapListeners(state, player, { grain: 0, vegetable: 0 })).toBeUndefined()
  })

  it('captures all crop receipts without running handlers and finishes all immediate phases first', () => {
    const { state, player } = setup()
    const flow = dispatchReapListeners(state, player, { grain: 1, vegetable: 2 })
    const receipt = activations(flow).map(leaf => leaf.type === 'leaf' ? {
      card: leaf.sourceCard, action: leaf.actionId, phase: leaf.params?.phase,
      event: leaf.params?.event, target: leaf.targetPlayerId,
    } : undefined)
    expect(flow?.type).toBe('seq')
    expect(receipt).toEqual([
      { card: IMMEDIATE, action: 'activate-card', phase: 'immediatelyAfter', event: { extraData: { crop: 'grain', amount: 1, trigger: { phase: 'harvest' } } }, target: player.id },
      { card: IMMEDIATE, action: 'activate-card', phase: 'immediatelyAfter', event: { extraData: { crop: 'vegetable', amount: 2, trigger: { phase: 'harvest' } } }, target: player.id },
      { card: AFTER, action: 'activate-card', phase: 'after', event: { extraData: { crop: 'grain', amount: 1, trigger: { phase: 'harvest' } } }, target: player.id },
      { card: AFTER, action: 'activate-card', phase: 'after', event: { extraData: { crop: 'vegetable', amount: 2, trigger: { phase: 'harvest' } } }, target: player.id },
    ])
  })

  it('preserves the reacting owner, harvesting player and private-field trigger', () => {
    const { state, player, owner } = setup(true)
    const flow = dispatchReapListeners(state, player, { vegetable: 2 }, {
      sourceCard: 'C072_FestivalPlanning', trigger: { phase: 'private-field-phase', cardId: 'C072_FestivalPlanning' },
    })
    expect(activations(flow)).toHaveLength(2)
    expect(activations(flow)[1]).toMatchObject({
      type: 'leaf', targetPlayerId: owner.id, actionId: 'activate-card',
      params: {
        ownerPlayerId: owner.id, triggerPlayerId: player.id, phase: 'after',
        event: { extraData: { crop: 'vegetable', amount: 2, sourceCard: 'C072_FestivalPlanning', trigger: { phase: 'private-field-phase', cardId: 'C072_FestivalPlanning' } } },
      },
    })
  })

  it('plans reactions from the actual harvested crop amounts while removing those crops', () => {
    const { state, player } = setup()
    player.resources.grain = 0
    player.resources.vegetable = 0
    player.fields = [
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    const result = reap(state, player)
    expect(result.reapSummary.resources).toEqual({ grain: 1, vegetable: 2 })
    expect(player.resources).toMatchObject({ grain: 1, vegetable: 2 })
    expect(player.fields.map(field => field.stacks)).toEqual([[{ kind: 'grain', remaining: 1 }], [], []])
    expect(activations(result.reactionFlow)).toHaveLength(4)
  })
})
