import { describe, expect, it } from 'vitest'
import { createOpeningSession } from './_helpers/session-fixtures'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { parseGameSetupRequest, buildInitialStateOptions } from '../game/game-setup-options'

describe('team scoring Session', () => {
  it('starts, restores and finishes a four-seat team game with authoritative team results', () => {
    const teamConfig = { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'category-min' } as const
    const session = createOpeningSession({ seed: 42, options: { playerCount: 4, teamConfig },
      expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } } })
    try {
      expect(session.state.team?.playerTeams).toEqual([0, 1, 0, 1])
      const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
      const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
      try {
        expect(restored.state.team).toEqual(session.state.team)
        // Advance the final round through the public Session end-of-round boundary.
        const state = restored.getState().state
        state.round = 14
        for (const player of state.players) {
          player.minorHand = ['__test_placeholder__']
          player.occupationHand = ['__test_placeholder__']
        }
        restored.loadState(state)
        const finished = restored.invokeAfterRoundEnd()
        expect(finished.ok).toBe(true)
        expect(finished.state.gameOver).toBe(true)
        expect(finished.interaction.stateId).toBe('gameover')
        expect(finished.scores).toHaveLength(4)
        expect(finished.teamScores).toMatchObject([
          { teamIndex: 0, playerIds: ['p1', 'p3'], rank: 1, total: -14 },
          { teamIndex: 1, playerIds: ['p2', 'p4'], rank: 1, total: -14 },
        ])
      } finally { restored.dispose() }
    } finally { session.dispose() }
  })
  it('accepts the same team configuration through HTTP and dev setup parsing and rejects unsupported combinations', () => {
    const teamConfig = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'shared' } as const
    expect(buildInitialStateOptions(parseGameSetupRequest({ playerCount: 4, teamConfig }, null)).teamConfig).toEqual(teamConfig)
    expect(() => parseGameSetupRequest({ playerCount: 5, teamConfig }, null)).toThrow('Invalid team configuration')
    expect(() => parseGameSetupRequest({ playerCount: 4, teamConfig, hotseat: true }, null)).toThrow()
  })
})
