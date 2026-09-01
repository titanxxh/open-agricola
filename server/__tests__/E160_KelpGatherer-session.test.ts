import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/E/E160_KelpGatherer'

const FIXED_HANDS = [
  { occupation: '__test_occupation_p1__', minor: '__test_minor_p1__' },
  { occupation: '__test_occupation_p2__', minor: '__test_minor_p2__' },
  { occupation: '__test_occupation_p3__', minor: '__test_minor_p3__' },
  { occupation: '__test_occupation_p4__', minor: '__test_minor_p4__' },
]

describe('E160_KelpGatherer session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession(160, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1
    state.players.forEach((player, index) => {
      player.occupationHand = [FIXED_HANDS[index]!.occupation]
      player.minorHand = [FIXED_HANDS[index]!.minor]
      player.resources.food = 0
      player.resources.vegetable = 0
    })

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
    expect(after.players[2]!.resources.food).toBe(0)
    expect(after.players[2]!.resources.vegetable).toBe(0)
    expect(after.players[3]!.resources.food).toBe(0)
    expect(after.players[3]!.resources.vegetable).toBe(0)
  })

  it('does not trigger when owner uses fishing', () => {
    const session = setup(0)
    const vegBefore = session.getState().state.players[0]!.resources.vegetable

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner should NOT get vegetable — scope is 'opponent'
    expect(after.players[0]!.resources.vegetable).toBe(vegBefore)
    expect(after.players[1]!.resources.vegetable).toBe(0)
    expect(after.players[2]!.resources.vegetable).toBe(0)
    expect(after.players[3]!.resources.vegetable).toBe(0)
  })

  it('does not trigger on non-fishing spaces', () => {
    const session = setup(1)
    const vegBefore = session.getState().state.players[0]!.resources.vegetable

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.vegetable).toBe(vegBefore)
    expect(after.players[2]!.resources.vegetable).toBe(0)
    expect(after.players[3]!.resources.vegetable).toBe(0)
  })
})
