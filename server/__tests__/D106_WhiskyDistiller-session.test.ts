import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { AnytimeAction } from '../../shared/contract/types'

import '../../shared/cards/D/D106_WhiskyDistiller'

describe('D106_WhiskyDistiller session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    player.occupationHand.push('D106_WhiskyDistiller')
    player.resources.grain = 1
    player.resources.food = 5
    state.futureMeeples = []
    session.loadState(state)
    session.devPlayCard(0, 'D106_WhiskyDistiller')
    return session
  }

  it('anytime listed when grain>=1 and round+2<=14', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('D106-whisky-distiller-anytime')
  })

  it('anytime hidden when no grain', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.grain = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D106-whisky-distiller-anytime')
  })

  it('anytime hidden after round 12 (round+2 > 14)', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 13
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D106-whisky-distiller-anytime')
  })

  it('triggering pays 1 grain and pushes future-meeple food:4 onto round+2', () => {
    const session = setup()
    session.takeAction(0, 'farmland')
    const before = session.getState().state
    expect(before.round).toBe(5)
    expect(before.players[0]!.resources.grain).toBe(1)

    const resp = session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')
    expect(resp.ok).toBe(true)

    const after = resp.state
    expect(after.players[0]!.resources.grain).toBe(0)
    const ours = after.futureMeeples.filter(
      (e) => e.cardId === 'D106_WhiskyDistiller' && e.playerId === after.players[0]!.id,
    )
    expect(ours).toHaveLength(1)
    expect(ours[0]!.round).toBe(7) // current 5 + 2
    expect(ours[0]!.resources.food).toBe(4)
  })

  it('not given immediately at the time of triggering', () => {
    const session = setup()
    session.takeAction(0, 'farmland')
    const resp = session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')
    expect(resp.ok).toBe(true)
    // Food should not be granted yet — only at the start of round 7.
    expect(resp.state.players[0]!.resources.food).toBe(5)
  })
})
