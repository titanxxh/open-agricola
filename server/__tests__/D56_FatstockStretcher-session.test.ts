import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/D/D56_FatstockStretcher'

describe('D56_FatstockStretcher session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Place card directly
    player.minorPlayed.push('D56_FatstockStretcher')
    // Give player a Fireplace for cooking
    player.improvements.push('Major_Fireplace1')
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (id) => id !== 'Major_Fireplace1',
    )
    // Give resources
    player.resources.sheep = 4
    player.resources.boar = 3
    player.resources.cattle = 2
    player.resources.vegetable = 2
    player.resources.grain = 3
    player.resources.food = 0

    session.loadState(state)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('grants 1 bonus food per sheep cooked', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')

    // Cook 2 sheep (Fireplace trade index 0 = sheep->2food)
    resp = session.resolveChoice(0, 'bulk:0=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(2)
    // 2 sheep × 2 food = 4 food from cooking
    // 2 sheep lost → 2 bonus food
    // Total = 4 + 2 = 6
    expect(player.resources.food).toBe(6)
  })

  it('grants 1 bonus food per boar cooked', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 2 boar (Fireplace trade index 1 = boar->2food)
    resp = session.resolveChoice(0, 'bulk:1=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(1)
    // 2 boar × 2 food = 4 food from cooking
    // 2 boar lost → 2 bonus food
    // Total = 4 + 2 = 6
    expect(player.resources.food).toBe(6)
  })

  it('grants bonus for mixed sheep and boar', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 1 sheep (index 0) + 1 boar (index 1)
    resp = session.resolveChoice(0, 'bulk:0=1,1=1')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(3)
    expect(player.resources.boar).toBe(2)
    // 1 sheep × 2f + 1 boar × 2f = 4 food from cooking
    // 1 sheep + 1 boar = 2 bonus food
    // Total = 4 + 2 = 6
    expect(player.resources.food).toBe(6)
  })

  it('no bonus when cooking cattle (not sheep/pig)', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 2 cattle (Fireplace trade index 2 = cattle->3food)
    resp = session.resolveChoice(0, 'bulk:2=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.cattle).toBe(0)
    // 2 cattle × 3 food = 6 food from cooking, no bonus
    expect(player.resources.food).toBe(6)
  })

  it('no bonus when cooking vegetables (not sheep/pig)', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 2 vegetable (Fireplace trade index 3 = vegetable->2food)
    resp = session.resolveChoice(0, 'bulk:3=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.vegetable).toBe(0)
    // 2 vegetable × 2 food = 4 food from cooking, no bonus
    expect(player.resources.food).toBe(4)
  })

  it('bonus only for sheep/boar in mixed batch with cattle', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 1 sheep (index 0) + 1 cattle (index 2)
    resp = session.resolveChoice(0, 'bulk:0=1,2=1')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(3)
    expect(player.resources.cattle).toBe(1)
    // 1 sheep × 2f + 1 cattle × 3f = 5 food from cooking
    // Only sheep counts for bonus: 1 bonus food
    // Total = 5 + 1 = 6
    expect(player.resources.food).toBe(6)
  })
})
