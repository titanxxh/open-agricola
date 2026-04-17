import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B51_DiggingSpade'

const CARD_ID = 'B51_DiggingSpade'

describe('B51_DiggingSpade session', () => {
  const setup = (pigsInPasture: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 7

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`minor:${CARD_ID}`)
    setWorkersAtHome(state, player, 2) // Add a pasture with `pigsInPasture` boar
    if (pigsInPasture > 0) {
      player.pastures = [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 1, col: 3 }],
          stables: 0,
          animalType: 'boar',
          animalCount: pigsInPasture,
        },
      ]
    }

    // Accumulate clay on clay-pit
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2

    state.players[1]!.workersAvailable = 2

    session.loadState(state)
    return session
  }

  it('grants FOOD equal to pigs when using clay-pit', () => {
    const session = setup(3)
    const before = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    // Expect 2 clay from accumulation, +3 food from Digging Spade
    expect(after.resources.clay).toBe(2)
    expect(after.resources.food).toBe(before + 3)
  })

  it('no food when no pigs in farmyard', () => {
    const session = setup(0)
    const before = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(before)
  })

  it('does not trigger on non-clay accumulation spaces', () => {
    const session = setup(3)
    const before = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(before)
  })
})
