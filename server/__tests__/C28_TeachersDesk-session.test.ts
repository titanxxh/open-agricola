import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C028_TeachersDesk'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C028_TeachersDesk'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

describe('C028_TeachersDesk session', () => {
  it('before-place-farmer on major-improvement offers optional occupation with 1 food cost', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C28-teachers-desk-before-place-farmer')!
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'major-improvement')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('occupation')
    expect(leaf.optional).toBe(true)
    expect(leaf.params).toEqual({ exactCost: { food: 1 } })
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('before-place-farmer on house-redevelopment also triggers', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C28-teachers-desk-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3 // house-redevelopment becomes available by mid game
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
    if (!space) return
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('occupation')
  })

  it('does not trigger when occupation hand is empty', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C28-teachers-desk-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = []
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'major-improvement')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('does not trigger on other spaces', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C28-teachers-desk-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

})
