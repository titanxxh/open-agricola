import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/D/D046_PelletPress'
import type { FutureMeeple } from '../../shared/contract/types'

describe('D046_PelletPress session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3
    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.reed = 3
    player.resources.food = 0
    // Directly place card
    player.minorPlayed.push('D046_PelletPress')
    session.loadState(state)
    return session
  }

  it('pay 1 reed → 4 future food entries, flagged', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const resp2 = session.takeAnytimeAction(0, 'D46-pellet-press-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.reed).toBe(2)
    expect(isCardFlagged(p, 'D046_PelletPress')).toBe(true)
    const fm = resp2.state.futureMeeples?.filter((m: FutureMeeple) => m.cardId === 'D046_PelletPress')
    expect(fm).toHaveLength(4)
    expect(fm![0].round).toBe(4)
    expect(fm![1].round).toBe(5)
    expect(fm![2].round).toBe(6)
    expect(fm![3].round).toBe(7)
  })

  it('not available without reed', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.reed = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D46-pellet-press-anytime')
  })
})
