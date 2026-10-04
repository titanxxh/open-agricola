import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

describe('player name provenance', () => {
  it('preserves a numeric account name and its origin when undo restores an earlier checkpoint', () => {
    const session = new GameSession(936)
    for (const player of session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    expect(session.state.players).toHaveLength(2)
    expect(session.state.players[0]!.nameIsDefault).toBe(true)
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    session.updatePlayerName(0, 'Player 6')
    expect(session.state.players[0]).toMatchObject({ name: 'Player 6', nameIsDefault: false })
    const restored = session.undoStep()
    expect(restored.ok).toBe(true)
    expect(restored.state.players[0]).toMatchObject({ name: 'Player 6', nameIsDefault: false })
    expect(restored.state.players[1]!.nameIsDefault).toBe(true)
  })
})
