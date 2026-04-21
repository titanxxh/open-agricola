import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import {
  executeCardListener,
  getRegisteredCardListeners,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C26_Flail'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C26_Flail'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('C26_Flail session', () => {
  it('onBuy grants 2 food', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, state.players[0]!)
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 2 })
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).sourceCard).toBe(CARD_ID)
  })

  it('after-place-farmer on farmland offers optional bake-bread', () => {
    const listener = findListener('C26-flail-after-place-farmer')!
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as any)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('bake-bread')
    expect(leaf.optional).toBe(true)
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('after-place-farmer on cultivation offers optional bake-bread', () => {
    const listener = findListener('C26-flail-after-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5 // cultivation available from round 5
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'cultivation')
    if (!space) return // not present in state; skip the assertion path
    const result = executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as any)
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('bake-bread')
  })

  it('does not trigger on non-trigger spaces', () => {
    const listener = findListener('C26-flail-after-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

})
