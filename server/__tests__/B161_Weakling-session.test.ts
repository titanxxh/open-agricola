import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B161_Weakling'

const CARD_ID = 'B161_Weakling'

describe('B161_Weakling session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2

    // Pile 6 wood on the Forest to create a 5+ accumulation space
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 6

    session.loadState(state)
    return session
  }

  it('gains 1 vegetable when 5+ space exists and you use a different space', () => {
    const session = setup()
    const before = session.getState().state.players[0]!.resources.vegetable
    // Use day-laborer (accumulation space but with 0 resources)
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before + 1)
  })

  it('does NOT gain vegetable when using the 5+ space', () => {
    const session = setup()
    const before = session.getState().state.players[0]!.resources.vegetable
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before)
  })

  it('does NOT gain vegetable when no space has 5+ resources', () => {
    const session = setup()
    const state = session.getState().state
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 2 // below threshold
    session.loadState(state)

    const before = state.players[0]!.resources.vegetable
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.vegetable).toBe(before)
  })
})
