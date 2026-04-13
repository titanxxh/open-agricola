import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B83_MuddyPuddles'

describe('B83_MuddyPuddles session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('B83_MuddyPuddles')
    player.resources.clay = 5
    session.loadState(state)
    session.devPlayCard(0, 'B83_MuddyPuddles')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')
    return resp
  }

  it('onBuy places 5 goods on stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, 'B83_MuddyPuddles')
    expect(stack).toEqual(['boar', 'food', 'cattle', 'food', 'sheep'])
    expect(stack.length).toBe(5)
  })

  it('anytime: pay 1 clay, gain sheep (top)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 3
    player.resources.sheep = 0
    session.loadState(state)

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'B83-muddy-puddles-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.clay).toBe(2) // 3 - 1
    expect(updatedPlayer.resources.sheep).toBe(1) // top was sheep
    const stack = getCardStack(updatedPlayer, 'B83_MuddyPuddles')
    expect(stack.length).toBe(4)
    expect(stack[stack.length - 1]).toBe('food') // new top
  })

  it('not available without clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('B83-muddy-puddles-anytime')
  })

  it('not available with empty stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 5
    player.cardStates!['B83_MuddyPuddles']!.stack = []
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('B83-muddy-puddles-anytime')
  })
})
