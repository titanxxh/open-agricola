import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B122_Mineralogist'

const CARD_ID = 'B122_Mineralogist'

describe('B122_Mineralogist session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2

    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2
    const westernQuarry = state.actionSpaces.find(
      (s) => s.id === 'western-quarry' || s.id === 'eastern-quarry',
    )
    if (westernQuarry) westernQuarry.resources.stone = 1

    session.loadState(state)
    return session
  }

  it('gains 1 stone when using Clay Pit', () => {
    const session = setup()
    const stoneBefore = session.getState().state.players[0]!.resources.stone
    const clayBefore = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(clayBefore + 2)
    expect(after.resources.stone).toBe(stoneBefore + 1)
  })

  it('does not trigger on non-clay/stone spaces', () => {
    const session = setup()
    const stoneBefore = session.getState().state.players[0]!.resources.stone
    const clayBefore = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(clayBefore)
    expect(after.resources.stone).toBe(stoneBefore)
  })
})
