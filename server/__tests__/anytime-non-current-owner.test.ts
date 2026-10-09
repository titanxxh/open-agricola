import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/D/D106_WhiskyDistiller'

const WHISKY = 'D106_WhiskyDistiller'
const WHISKY_ANYTIME_ID = 'D106-whisky-distiller-anytime'

describe('anytime — non-current-player owner', () => {
  it('player 1 is reorg owner while currentPlayerIndex = 0; only player 1 may trigger', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const p of state.players) {
      p.minorHand = ['__test_placeholder__']
      p.occupationHand = ['__test_placeholder__']
    }
    const p1 = state.players[1]!
    p1.minorPlayed.push(WHISKY)
    p1.resources = { ...p1.resources, grain: 5, sheep: 3 }
    session.loadState(state)

    ;(session as unknown as { startReorgSubFlow: (i: number, t: string) => void })
      .startReorgSubFlow(1, 'anytime')

    const snap = session.getState()
    expect((snap.interaction as { promptKey?: string }).promptKey)
      .toBe('ui.interactionAnimalReorg')

    // currentPlayerIndex is still 0; the active frame owner is 1
    const wrongPlayer = session.takeAnytimeAction(0, WHISKY_ANYTIME_ID)
    expect(wrongPlayer.ok).toBe(false)
    expect(wrongPlayer.error).toContain('not your turn')

    const rightPlayer = session.takeAnytimeAction(1, WHISKY_ANYTIME_ID)
    expect(rightPlayer.ok).toBe(true)
    expect(rightPlayer.state.players[1]!.resources.grain).toBe(4)
  })
})
