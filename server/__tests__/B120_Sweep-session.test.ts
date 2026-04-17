import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B120_Sweep'

const CARD_ID = 'B120_Sweep'

describe('B120_Sweep session', () => {
  const setup = (round: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2

    session.loadState(state)
    return session
  }

  it('gains 2 clay when using day-laborer in round 12 (fixed mapping)', () => {
    const session = setup(12)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    // Sweep adds 2 clay
    expect(after.resources.clay).toBe(before + 2)
  })

  it('gains 2 clay when using fishing in round 13 (fixed mapping)', () => {
    const session = setup(13)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 2)
  })

  it('does not trigger in round 1 (no above-space mapping)', () => {
    const session = setup(1)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before)
  })

  it('does not trigger for non-matching space in round 12', () => {
    const session = setup(12)
    const before = session.getState().state.players[0]!.resources.clay
    // In round 12 "above" = day-laborer, so using fishing must not trigger
    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before)
  })
})
