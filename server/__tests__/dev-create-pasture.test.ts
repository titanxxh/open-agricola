import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { workersAvailable } from '../../shared/game/player'
describe('dev create pasture', () => {
  it('does not consume worker and enters fence select pending', () => {
    const session = new GameSession()
    const state = session.getState().state
    const beforeWorkers = workersAvailable(state, state.players[0])
    const beforeTaken = state.actionSpaces.find((s) => s.id === 'fencing')?.takenBy ?? null

    const resp = session.startDevFenceSelect(0)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.promptKey).toBe('ui.interactionFenceSelect')
    }
    expect(workersAvailable(resp.state, resp.state.players[0])).toBe(beforeWorkers)
    expect(resp.state.actionSpaces.find((s) => s.id === 'fencing')?.takenBy ?? null).toBe(beforeTaken)
  })
})

