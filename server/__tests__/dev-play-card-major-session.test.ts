import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getPlayedCardKeys } from '../../shared/domain/player'

describe('devPlayCard major improvements', () => {
  it('plays a major into player improvements and removes it from the public supply', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)

    const resp = session.devPlayCard(0, 'Major_Fireplace1')

    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.improvements).toContain('Major_Fireplace1')
    expect(player.minorPlayed).not.toContain('Major_Fireplace1')
    expect(getPlayedCardKeys(player)).toContain('major:Major_Fireplace1')
    expect(resp.state.availableMajorImprovements).not.toContain('Major_Fireplace1')
  })
})
