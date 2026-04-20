import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C160_Outrider'

const CARD_ID = 'C160_Outrider'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('C160_Outrider session', () => {
  it('gains 1 grain when placing on the most recently revealed space', () => {
    const listener = findListener('C160-outrider-before-place-farmer')!
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5
    // roundActionOrder[state.round - 1] is the last revealed action id
    state.roundActionOrder[4] = 'cultivation'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const cultivation = state.actionSpaces.find((s) => s.id === 'cultivation')
    if (!cultivation) return

    const result = executeCardListener(listener, {
      state,
      player,
      space: cultivation,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeDefined()
    const leaf = result!.flow as any
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ grain: 1 })
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('does not trigger when placing on a different action space', () => {
    const listener = findListener('C160-outrider-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5
    state.roundActionOrder[4] = 'cultivation'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when roundActionOrder entry is null', () => {
    const listener = findListener('C160-outrider-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5
    // leave roundActionOrder[4] as null (default)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })

})
