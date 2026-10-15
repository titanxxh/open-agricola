import { ActionHookRegistry } from '../../actions/hooks'
import { beforeEach as beforeEachActionHooks } from 'vitest'

let actionHooks: ActionHookRegistry
beforeEachActionHooks(() => { actionHooks = new ActionHookRegistry() })

import { describe, expect, it } from 'vitest'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import { createInitialState } from '../state-bootstrap'
import { computeActionEntryAvailability } from '../action-entry-query'

describe('computeActionEntryAvailability', () => {
  it('reuses one placement scan across occupied spaces', () => {
    const state = createInitialState(563, { playerCount: 2 })
    const player = state.players[0]!
    state.actionSpaces[0]!.takenBy = [{ playerId: state.players[1]!.id, workerId: '1' }]
    state.actionSpaces[1]!.takenBy = [{ playerId: state.players[1]!.id, workerId: '2' }]
    let calls = 0
    for (const space of state.actionSpaces) {
      const canBeExecutedByPlayer = space.canBeExecutedByPlayer
      space.canBeExecutedByPlayer = function (...args) {
        calls += 1
        return canBeExecutedByPlayer.apply(this, args)
      }
    }

    const options = { isActionDoable: (_space: import('../../contract/types').ActionSpace, baseDoable: () => boolean) => baseDoable() }
    computeAllowedPlacementSpaces(state, player, { actionHooks, ...options })
    const callsPerPlacementScan = calls
    calls = 0

    computeActionEntryAvailability(state, player, { actionHooks, ...options })

    expect(callsPerPlacementScan).toBeGreaterThan(0)
    expect(calls).toBe(callsPerPlacementScan)
  })
})
