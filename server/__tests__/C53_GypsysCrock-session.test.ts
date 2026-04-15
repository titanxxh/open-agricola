import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/C/C53_GypsysCrock'

describe('C53_GypsysCrock session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Place card directly
    player.minorPlayed.push('C53_GypsysCrock')
    player.playedCards.push('minor:C53_GypsysCrock')
    // Give player a Fireplace for cooking
    player.improvements.push('Major_Fireplace1')
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (id) => id !== 'Major_Fireplace1',
    )
    // Give resources for cooking
    player.resources.sheep = 5
    player.resources.boar = 3
    player.resources.cattle = 2
    player.resources.vegetable = 2
    player.resources.food = 0

    session.loadState(state)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('grants bonus food when cooking 2 goods at once (2 sheep = 1 bonus)', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Take anytime-exchange action
    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')

    // Cook 2 sheep at once using bulk format
    // Fireplace trade index 0 = sheep->2food
    resp = session.resolveChoice(0, 'bulk:0=2')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Started with 5 sheep, cooked 2 → 3 remaining
    expect(player.resources.sheep).toBe(3)
    // 2 sheep × 2 food each = 4 food from cooking
    // 2 goods lost → floor(2/2) = 1 bonus food
    // Total = 4 + 1 = 5
    expect(player.resources.food).toBe(5)
  })

  it('grants bonus food proportional to goods lost (4 sheep = 2 bonus)', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)

    // Cook 4 sheep at once
    resp = session.resolveChoice(0, 'bulk:0=4')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(1)
    // 4 sheep × 2 food = 8 food from cooking
    // 4 goods lost → floor(4/2) = 2 bonus food
    // Total = 8 + 2 = 10
    expect(player.resources.food).toBe(10)
  })

  it('grants bonus for mixed goods cooked in same batch', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)

    // Cook 1 sheep (index 0) + 1 boar (index 1) + 1 vegetable (index 3)
    // = 3 goods lost → floor(3/2) = 1 bonus food
    resp = session.resolveChoice(0, 'bulk:0=1,1=1,3=1')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(4)
    expect(player.resources.boar).toBe(2)
    expect(player.resources.vegetable).toBe(1)
    // 1 sheep × 2f + 1 boar × 2f + 1 veg × 2f = 6 food from cooking
    // 3 goods lost → floor(3/2) = 1 bonus food
    // Total = 6 + 1 = 7
    expect(player.resources.food).toBe(7)
  })

  it('no bonus when cooking only 1 good', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)

    // Cook only 1 sheep
    resp = session.resolveChoice(0, 'bulk:0=1')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(4)
    // 1 sheep × 2 food = 2 food from cooking
    // 1 good lost → floor(1/2) = 0 bonus
    // Total = 2
    expect(player.resources.food).toBe(2)
  })

  it('no bonus when exchange is cancelled', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'anytime-exchange')
    expect(resp.ok).toBe(true)

    resp = session.resolveChoice(0, 'cancel')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(0)
  })
})
