import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { executeCardListener, getRegisteredCardListeners } from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C140_PackagingArtist'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C140_PackagingArtist'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('C140_PackagingArtist session', () => {
  it('onBuy grants 1 grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, state.players[0]!)
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ grain: 1 })
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).sourceCard).toBe(CARD_ID)
  })

  it('before minor-improvement offers optional bake-bread', () => {
    const listener = findListener('C140-packaging-artist-before-minor-improvement')!
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'before',
    } as any)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('bake-bread')
    expect(leaf.optional).toBe(true)
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

})
