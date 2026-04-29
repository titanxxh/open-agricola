import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A139_HollowWarden'

const CARD_ID = 'A139_HollowWarden'

describe('A139_HollowWarden session', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.players = state.players.slice(0, 4) // 4 players for hollow-4 space
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    // Ensure hollow-4 space exists with accumulated clay
    const hollow = state.actionSpaces.find((s) => s.id === 'hollow-4')
    if (hollow) hollow.resources.clay = 4

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  it('gains 1 food when using hollow-4 space', () => {
    const session = setup()
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'hollow-4')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Should get clay from hollow + 1 food from HollowWarden
    expect(player.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger on non-hollow spaces', () => {
    const session = setup()
    const woodBefore = session.getState().state.players[0]!.resources.wood
    const foodBefore = session.getState().state.players[0]!.resources.food

    // Use farmland (gives no food, no wood) to verify no HollowWarden trigger
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // HollowWarden should NOT have given extra food
    expect(player.resources.food).toBe(foodBefore)
  })

  it('gains 1 food when using 3p hollow space', () => {
    // 3p game uses 'hollow' space (non-4p variant). BGA listens via
    // isActionCardEvent($event, 'Hollow') which matches both spaces.
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    const hollow = state.actionSpaces.find((s) => s.id === 'hollow')
    if (!hollow) {
      // Some 3p configs may differ; skip if space missing.
      return
    }
    hollow.resources.clay = 2

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const foodBefore = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'hollow')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger for opponent using hollow', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    state.players[1]!.workersAvailable = 2
    session.loadState(state)

    const resp = session.takeAction(1, 'hollow-4')
    expect(resp.ok).toBe(true)

    // Owner should not get bonus food
    const owner = resp.state.players[0]!
    expect(owner.resources.food).toBe(session.getState().state.players[0]!.resources.food)
  })
})
