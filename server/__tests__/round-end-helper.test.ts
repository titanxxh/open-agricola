import { describe, expect, it } from 'vitest'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { createWorkSession } from './_helpers/session-fixtures'

describe('autoAdvanceRoundEnd', () => {
  it('returns a completed round response without starting another round', () => {
    const session = createWorkSession()
    try {
      const state = session.getState().state
      expect(state.players).toHaveLength(2)
      expect(state.round).toBe(1)
      state.players.forEach(player => markAllWorkersUsed(state, player))
      const initialResponse = session.performRoundEnd()
      expect(initialResponse.ok).toBe(true)
      expect(initialResponse.state).toMatchObject({ round: 2, roundPhase: 'work' })
      const completed = autoAdvanceRoundEnd(session, { initialResponse })
      expect(completed.ok).toBe(true)
      expect(completed.state).toMatchObject({ round: 2, roundPhase: 'work' })
      expect(() => autoAdvanceRoundEnd(session)).toThrow('Round-end command failed: not all workers used')
    } finally {
      session.dispose()
    }
  })
})
