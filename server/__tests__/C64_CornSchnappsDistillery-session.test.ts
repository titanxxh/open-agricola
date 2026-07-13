import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/C/C064_CornSchnappsDistillery'
import type { FutureMeeple } from '../../shared/contract/types'

describe('C064_CornSchnappsDistillery session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3
    const player = state.players[0]!
    player.resources.wood = 1
    player.resources.clay = 2
    player.resources.grain = 3
    player.resources.food = 0
    // Directly place card
    player.minorPlayed.push('C064_CornSchnappsDistillery')
    session.loadState(state)
    return session
  }

  it('pay 1 grain → 4 future food entries (rounds +1 through +4), flagged', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const resp2 = session.takeAnytimeAction(0, 'C64-corn-schnapps-distillery-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.grain).toBe(2)
    expect(isCardFlagged(p, 'C064_CornSchnappsDistillery')).toBe(true)
    const fm = resp2.state.futureMeeples?.filter((m: FutureMeeple) => m.cardId === 'C064_CornSchnappsDistillery')
    expect(fm).toHaveLength(4)
    expect(fm![0].round).toBe(4)
    expect(fm![1].round).toBe(5)
    expect(fm![2].round).toBe(6)
    expect(fm![3].round).toBe(7)
  })

  it('not available without grain', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.grain = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('C64-corn-schnapps-distillery-anytime')
  })
})
