import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B121_Geologist'

const CARD_ID = 'B121_Geologist'

describe('B121_Geologist session', () => {
  const setup = (playerCount: 2 | 3 | 4 = 2) => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players.forEach((p) => (p.workersAvailable = 2))

    // Pre-seed accumulation on relevant spaces
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3
    const reed = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (reed) reed.resources.reed = 1
    const clay = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clay) clay.resources.clay = 2

    session.loadState(state)
    return session
  }

  it('gains 1 extra clay when using Forest', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 1)
  })

  it('gains 1 extra clay when using Reed Bank', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 1)
  })

  it('does NOT trigger on Clay Pit in a 2-player game', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    // accumulates 2 clay but no geologist bonus at 2 players
    expect(after.resources.clay).toBe(before + 2)
  })

  it('DOES trigger on Clay Pit in a 3+ player game', () => {
    const session = setup(3)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 2 + 1)
  })

  it('does not trigger on unrelated spaces', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(before)
  })
})
