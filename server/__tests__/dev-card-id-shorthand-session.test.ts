import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('dev card id shorthand', () => {
  it('draws the unique deck-number card id', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players[0]!.minorHand = ['__test_placeholder__']
    state.players[0]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    const resp = session.devDrawCard(0, 'C148')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationHand).toContain('C148_MudWallower')
    expect(resp.state.players[0]!.occupationHand).not.toContain('C148')
    expect(resp.state.players[0]!.minorHand).not.toContain('C148')
  })

  it('plays the unique deck-number card id', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players[0]!.minorPlayed = []
    state.players[0]!.occupationPlayed = []
    session.loadState(state)

    const resp = session.devPlayCard(0, 'C148')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('C148_MudWallower')
    expect(resp.state.players[0]!.occupationPlayed).not.toContain('C148')
    expect(resp.state.players[0]!.minorPlayed).not.toContain('C148')
  })

  it('matches exact card number instead of id prefix', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players[0]!.minorHand = ['__test_placeholder__']
    state.players[0]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    const resp = session.devDrawCard(0, 'C1')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).toContain('C001_Overhaul')
    expect(resp.state.players[0]!.minorHand).not.toContain('C1')
    expect(resp.state.players[0]!.occupationHand).not.toContain('C148_MudWallower')
  })
})
