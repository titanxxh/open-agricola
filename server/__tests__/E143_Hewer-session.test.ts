import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E143_Hewer'

const CARD_ID = 'E143_Hewer'

describe('E143_Hewer session', () => {
  it('effect returns gain flow when clay-pit unoccupied and round >= 3', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    player.resources.food = 10
    player.resources.stone = 0
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!

    // Ensure clay-pit is unoccupied
    const clayPit = updatedState.actionSpaces.find(s => s.id === 'clay-pit')
    if (clayPit) clayPit.takenBy = null

    const flow = runCardEffectHook(updatedState, updatedPlayer, CARD_ID, 'onBeforeReturnHome')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('gain')
    expect((flow as any).params).toEqual({ stone: 1, food: 1 })
  })

  it('does not trigger when round < 3', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!

    const flow = runCardEffectHook(updatedState, updatedPlayer, CARD_ID, 'onBeforeReturnHome')
    expect(flow).toBeNull()
  })

  it('does not trigger when clay-pit is occupied', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!

    const clayPit = updatedState.actionSpaces.find(s => s.id === 'clay-pit')
    if (clayPit) clayPit.takenBy = 'p2'

    const flow = runCardEffectHook(updatedState, updatedPlayer, CARD_ID, 'onBeforeReturnHome')
    expect(flow).toBeNull()
  })
})
