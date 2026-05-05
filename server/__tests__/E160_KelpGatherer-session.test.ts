import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'
import '../../shared/cards/E/E160_KelpGatherer'

describe('E160_KelpGatherer session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('E160_KelpGatherer')
    setWorkersAtHome(state, owner, 2)
    owner.resources.vegetable = 0

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.resources.food = 0

    // Ensure fishing has accumulated resources
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (fishing) fishing.resources.food = 2

    session.loadState(state)
    return session
  }

  it('opponent gets 1 extra food and owner gets 1 vegetable when opponent uses fishing', () => {
    const session = setup(1)
    const s = session.getState().state
    const vegBefore = s.players[0]!.resources.vegetable
    const opponentFoodBefore = s.players[1]!.resources.food
    const fishingFood = s.actionSpaces.find((sp) => sp.id === 'fishing')?.resources.food ?? 0

    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through player switches for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Owner gets 1 vegetable
    expect(after.players[0]!.resources.vegetable).toBe(vegBefore + 1)
    // Opponent gets fishing food + 1 extra from KelpGatherer
    expect(after.players[1]!.resources.food).toBe(opponentFoodBefore + fishingFood + 1)
  })

  it('does not trigger when owner uses fishing', () => {
    const session = setup(0)
    const vegBefore = session.getState().state.players[0]!.resources.vegetable

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner should NOT get vegetable — scope is 'opponent'
    expect(after.players[0]!.resources.vegetable).toBe(vegBefore)
  })

  it('does not trigger on non-fishing spaces', () => {
    const session = setup(1)
    const vegBefore = session.getState().state.players[0]!.resources.vegetable

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.vegetable).toBe(vegBefore)
  })
})
