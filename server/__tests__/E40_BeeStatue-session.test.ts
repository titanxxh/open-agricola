import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E040_BeeStatue'

describe('E040_BeeStatue session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('E040_BeeStatue')
    player.resources.clay = 5
    session.loadState(state)
    session.devPlayCard(0, 'E040_BeeStatue')
    return session
  }

  it('onBuy places 5 goods on stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, 'E040_BeeStatue')
    expect(stack).toEqual(['vegetable', 'stone', 'grain', 'stone', 'grain'])
    expect(stack.length).toBe(5)
  })

  it('using day-laborer gains top good (grain) and stack shrinks', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    // Day laborer gives 1 food, plus bee statue gives grain (top of stack)
    expect(updatedPlayer.resources.grain).toBe(1)
    const stack = getCardStack(updatedPlayer, 'E040_BeeStatue')
    expect(stack.length).toBe(4)
    expect(stack[stack.length - 1]).toBe('stone') // new top
  })

  it('no trigger when stack is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    player.cardStates!['E040_BeeStatue']!.stack = []
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    // Only day laborer food, no grain from bee statue
    expect(updatedPlayer.resources.grain).toBe(0)
  })

  it('no trigger for other action spaces', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    session.loadState(state)

    // Use farmland instead of day-laborer
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.grain).toBe(0)
    const stack = getCardStack(updatedPlayer, 'E040_BeeStatue')
    expect(stack.length).toBe(5) // unchanged
  })
})
