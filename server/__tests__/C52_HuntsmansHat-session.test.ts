import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

describe('C52_HuntsmansHat server session', () => {
  it('adds food and logs cardEffectGain when collecting boar from pig-market', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]
    player.resources.food = 0
    player.resources.boar = 0
    player.minorPlayed.push('C52_HuntsmansHat')
    player.playedCards = player.playedCards ?? []
    if (!player.playedCards.includes('minor:C52_HuntsmansHat')) {
      player.playedCards.push('minor:C52_HuntsmansHat')
    }

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (!pigMarket) throw new Error('pig-market space missing')
    pigMarket.resources.boar = 2

    session.loadState(state)
    const resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0].resources.boar).toBe(2)
    expect(resp.state.players[0].resources.food).toBe(2)
    const hasLog = resp.state.log.some(
      (e) =>
        e.key === 'log.cardEffectGain' &&
        e.params?.cardId === 'C52_HuntsmansHat' &&
        e.params?.gain === '2 FOOD',
    )
    expect(hasLog).toBe(true)
  })
})

