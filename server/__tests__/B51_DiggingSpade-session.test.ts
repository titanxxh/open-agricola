import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/domain/player'
import { B051_DiggingSpade } from '../../shared/cards/B/B051_DiggingSpade'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'B051_DiggingSpade'

describe('B051_DiggingSpade session', () => {
  const setup = (pigsInPasture: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 7

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
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

  describe('prerequisite "Play in Round 7 or Later"', () => {
    it('blocks when round < 7', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.round = 6
      const player = state.players[0]!
      expect(meetsCardPrerequisites(player, B051_DiggingSpade, state.round, state)).toBe(false)
    })

    it('allows when round >= 7', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.round = 7
      const player = state.players[0]!
      expect(meetsCardPrerequisites(player, B051_DiggingSpade, state.round, state)).toBe(true)
    })
  })
})
