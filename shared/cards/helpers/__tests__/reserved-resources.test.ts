import { describe, expect, it } from 'vitest'
import { installOfficialCardRegistry } from '../../__tests__/card-environment'
import { createInitialState } from '../../../session/state-bootstrap'
import { sowAction } from '../../../actions/effects/sow'
import { evaluateWithGrantedResources } from '../reserved-resources'

installOfficialCardRegistry()

describe('evaluateWithGrantedResources', () => {
  it.each([
    { hasField: true, expected: true },
    { hasField: false, expected: false },
  ])('checks sowing after a grant without changing the original resources: %j', ({ hasField, expected }) => {
    const state = createInitialState(42, { playerCount: 2 })
    const player = state.players[0]!
    player.fields = hasField ? [{ row: 0, col: 0, stacks: [] }] : []
    player.resources.grain = 0
    player.resources.vegetable = 0
    expect(sowAction.canBeExecutedByPlayer(state, player, { actionHooks: undefined })).toBe(false)

    const doable = evaluateWithGrantedResources(state, player, { vegetable: 1 }, (nextState, nextPlayer) => {
      expect(nextState.players[0]).toBe(nextPlayer)
      expect(nextPlayer.resources.vegetable).toBe(1)
      return sowAction.canBeExecutedByPlayer(nextState, nextPlayer, { actionHooks: undefined })
    })

    expect(doable).toBe(expected)
    expect(state.players[0]).toBe(player)
    expect(player.resources.vegetable).toBe(0)
  })
})
