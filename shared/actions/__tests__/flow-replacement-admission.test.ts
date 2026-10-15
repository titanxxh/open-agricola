import { ActionHookRegistry } from '../hooks'
import { describe, expect, it } from 'vitest'
import { evaluateFlowDoable } from '../flow'
import { familyGrowthAction } from '../effects/family-growth'
import { CardRegistry } from '../../cards/registry'
import { withActiveRegistry } from '../../cards/active-registry'
import { createInitialState } from '../../session/state-bootstrap'

describe('replacement flow admission', () => {
  // Confirmed public flow seam: a consumed replacement producer changes the
  // admission opportunity; the same action and params do not imply a loop.
  it.each([true, false])('admits the same-action replacement only when its room check is bypassed: %s', (skipRoomCheck) => {
    const state = createInitialState(42, { playerCount: 2 })
    const player = state.players[0]!
    const space = state.actionSpaces.find((candidate) => candidate.id === 'wish-children')!
    const registry = new CardRegistry()
    registry.registerListener({
      id: 'same-action-room-replacement',
      actions: ['family-growth'],
      phases: ['computeReplace'],
      handler: () => ({
        decline: true,
        alternativeFlow: { type: 'leaf', actionId: 'family-growth', actionContext: { skipRoomCheck } },
      }),
    })
    const doable = withActiveRegistry(registry, () => evaluateFlowDoable(
      { type: 'leaf', actionId: 'family-growth' },
      { state, player, space, actionHooks: new ActionHookRegistry() },
      (id) => id === 'family-growth' ? familyGrowthAction : undefined,
    ))
    expect(doable).toBe(skipRoomCheck)
    expect(player.workers.filter((worker) => worker.isActive)).toHaveLength(2)
  })
})
