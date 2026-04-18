import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/A/A124_Knapper'

const CARD_ID = 'A124_Knapper'

describe('A124_Knapper session', () => {
  const setupForRound = (round: number, revealedSpaceId: string) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Reveal the specified action-card space on the given round.
    state.roundActionOrder[round - 1] = revealedSpaceId

    // Stock the revealed space with some resources so we can measure gain.
    const space = state.actionSpaces.find((s) => s.id === revealedSpaceId)
    if (space) {
      space.resources.stone = 1
    }

    session.loadState(state)
    return session
  }

  it('grants 1 STONE when placing on a round-5 action-card space', () => {
    const session = setupForRound(5, 'western-quarry')
    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Space yields 1 stone (we stocked 1). Card adds +1. Total = 2.
    expect(p.resources.stone ?? 0).toBe(2)
  })

  it('grants 1 STONE when placing on a round-7 action-card space', () => {
    const session = setupForRound(7, 'western-quarry')
    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    expect(p.resources.stone ?? 0).toBe(2)
  })

  it('does not trigger on a non-action-card space (day-laborer)', () => {
    const session = setupForRound(5, 'western-quarry')
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // day-laborer is a common (not round-card) space; knapper shouldn't fire.
    expect(p.resources.stone ?? 0).toBe(0)
  })

  it('does not trigger on round 4 action-card space (outside 5-7 range)', () => {
    // Space revealed on round 4 — the card should NOT trigger.
    const session = setupForRound(4, 'eastern-quarry')
    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // eastern-quarry gives stone from its accumulated resources, but Knapper
    // should add nothing (only 1 stone from the space, not 2).
    // We stocked the space with 1 stone, so total should be exactly 1.
    expect(p.resources.stone ?? 0).toBe(1)
  })

  it('does not trigger when card is not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundActionOrder[4] = 'western-quarry'

    const wq = state.actionSpaces.find((s) => s.id === 'western-quarry')
    if (wq) wq.resources.stone = 1

    session.loadState(state)

    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Only the space's own stone (1), no bonus from Knapper.
    expect(p.resources.stone ?? 0).toBe(1)
  })
})
