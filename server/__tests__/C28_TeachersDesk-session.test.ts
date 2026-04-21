import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C28_TeachersDesk'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C28_TeachersDesk'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('C28_TeachersDesk session', () => {
  it('before-place-farmer on major-improvement offers optional play-occupation with 1 food cost', () => {
    const listener = findListener('C28-teachers-desk-before-place-farmer')!
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'major-improvement')!
    const result = executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('play-occupation')
    expect(leaf.optional).toBe(true)
    expect(leaf.params).toEqual({ costOverride: { food: 1 } })
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('before-place-farmer on house-redevelopment also triggers', () => {
    const listener = findListener('C28-teachers-desk-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3 // house-redevelopment becomes available by mid game
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
    if (!space) return
    const result = executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('play-occupation')
  })

  it('does not trigger when occupation hand is empty', () => {
    const listener = findListener('C28-teachers-desk-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = []
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'major-improvement')!
    const result = executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger on other spaces', () => {
    const listener = findListener('C28-teachers-desk-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })

})
