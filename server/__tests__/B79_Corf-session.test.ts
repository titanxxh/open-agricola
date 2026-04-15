import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/B/B79_Corf'

const CARD_ID = 'B79_Corf'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5 // ensure eastern-quarry is available (round 5+)

  const player = state.players[0]!
  player.workersAvailable = 2
  player.resources.stone = 0
  player.minorHand.push(CARD_ID)

  // Put stone on the eastern-quarry space so collect has 3+ stone
  const quarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
  if (quarry) quarry.resources.stone = 4

  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

describe('B79_Corf session', () => {
  it('owner gets 1 stone when collecting 3+ stone from accumulation space', () => {
    const session = setup()
    const state = session.getState().state
    const stoneBefore = state.players[0]!.resources.stone

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Collected 4 stone from quarry + 1 bonus from Corf = 5 stone total
    expect(player.resources.stone).toBe(stoneBefore + 4 + 1)
  })

  it('does not trigger when collecting less than 3 stone', () => {
    const session = setup()
    const state = session.getState().state

    // Reduce stone on quarry to 2 (less than 3)
    const quarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (quarry) quarry.resources.stone = 2
    session.loadState(state)

    const stoneBefore = session.getState().state.players[0]!.resources.stone

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Collected 2 stone, no bonus (threshold is 3)
    expect(player.resources.stone).toBe(stoneBefore + 2)
  })

  it('triggers when opponent collects 3+ stone (scope any)', () => {
    const session = setup()
    const state = session.getState().state

    // Player 1 (opponent) has workers available
    state.currentPlayerIndex = 1
    state.players[1]!.workersAvailable = 2

    // Make sure quarry has 3+ stone
    const quarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (quarry) quarry.resources.stone = 3
    session.loadState(state)

    const ownerStoneBefore = session.getState().state.players[0]!.resources.stone

    // Player 1 (opponent) takes the quarry
    const resp = session.takeAction(1, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    // Card owner (player 0) should have gained 1 stone from Corf
    expect(resp.state.players[0]!.resources.stone).toBe(ownerStoneBefore + 1)
  })

  it('does not trigger for non-stone accumulation spaces', () => {
    const session = setup()
    const state = session.getState().state

    // Put wood on forest
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 5
    session.loadState(state)

    const stoneBefore = session.getState().state.players[0]!.resources.stone

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // No stone gained (forest gives wood, not stone)
    expect(resp.state.players[0]!.resources.stone).toBe(stoneBefore)
  })
})
