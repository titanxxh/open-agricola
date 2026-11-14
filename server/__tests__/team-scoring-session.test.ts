import { expect, it } from 'vitest'
import { createOpeningSession } from './_helpers/session-fixtures'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { buildInitialStateOptions, parseGameSetupRequest } from '../game/game-setup-options'

it.each([
  { scoring: 'sum', total: -28 }, { scoring: 'product', total: 0 },
  { scoring: 'category-min', total: -14 }, { scoring: 'total-min', total: -14 },
])('starts, restores and finishes a four-seat Multihand game with $scoring results', ({ scoring, total }) => {
  const options = buildInitialStateOptions(parseGameSetupRequest({ playerCount: 4,
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring },
  }, null))
  const session = createOpeningSession({ seed: 42, options,
    expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } } })
  try {
    expect(session.state).toMatchObject({ team: { playerTeams: [0, 1, 0, 1] } })
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    try {
      expect(restored.state).toMatchObject({ team: { playerTeams: [0, 1, 0, 1] } })
      const state = restored.getState().state
      state.round = 14
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']
      }
      restored.loadState(state)
      const finished = restored.invokeAfterRoundEnd()
      expect(finished).toMatchObject({ ok: true, state: { gameOver: true }, interaction: { stateId: 'gameover' },
        teamScores: [
          { teamIndex: 0, playerIds: ['p1', 'p3'], scoring, rank: 1, total },
          { teamIndex: 1, playerIds: ['p2', 'p4'], scoring, rank: 1, total },
        ],
      })
      expect(finished.scores).toHaveLength(4)
    } finally { restored.dispose() }
  } finally { session.dispose() }
})

it('keeps ordinary two-player games outside Team scoring', () => {
  const session = createOpeningSession({ seed: 42,
    expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } } })
  try {
    expect(session.state).not.toHaveProperty('team')
    expect(session.getState()).not.toHaveProperty('teamScores')
  } finally { session.dispose() }
})
