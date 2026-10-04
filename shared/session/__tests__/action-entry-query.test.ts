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

    computeAllowedPlacementSpaces(state, player)
    const callsPerPlacementScan = calls
    calls = 0

    computeActionEntryAvailability(state, player, {
      isActionDoable: (_space, baseDoable) => baseDoable(),
    })

    expect(callsPerPlacementScan).toBeGreaterThan(0)
    expect(calls).toBe(callsPerPlacementScan)
  })
})
