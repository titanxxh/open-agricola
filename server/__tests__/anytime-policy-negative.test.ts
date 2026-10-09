import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/D/D106_WhiskyDistiller'

const WHISKY = 'D106_WhiskyDistiller'
const WHISKY_ANYTIME_ID = 'D106-whisky-distiller-anytime'

const baseSetup = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
  state.players[0]!.minorPlayed.push(WHISKY)
  state.players[0]!.resources = { ...state.players[0]!.resources, grain: 5 }
  session.loadState(state)
  return session
}

describe('anytime — negative server-execution paths', () => {
  it('rejects when gameOver = true', () => {
    const session = baseSetup()
    const state = session.getState().state
    state.gameOver = true
    session.loadState(state)
    const r = session.takeAnytimeAction(0, WHISKY_ANYTIME_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('game is over')
  })

  it('rejects when phase === draft', () => {
    const session = baseSetup()
    const state = session.getState().state
    state.phase = 'draft'
    session.loadState(state)
    const r = session.takeAnytimeAction(0, WHISKY_ANYTIME_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('draft')
  })

  it('rejects idle anytime from a non-current player', () => {
    const session = baseSetup()
    const r = session.takeAnytimeAction(1, WHISKY_ANYTIME_ID)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not your turn')
  })

  it.todo('feed-window-locked rejection — covered indirectly via harvest E2E flows')
})
