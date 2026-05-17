import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C140_PackagingArtist'
import type { ActionFlow } from '../../shared/contract/types'

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

  // BGA: computeReplaceImprovement returns bakeBreadNode — minor-improvement
  // action is REPLACED by bake-bread (not "alongside"). Implementation uses a
  // computeReplace listener with `decline + alternativeFlow: bake-bread leaf`.
  it('computeReplace replaces minor-improvement with bake-bread (decline + alternativeFlow)', () => {
    const listener = findListener('C140-packaging-artist-replace-minor-improvement')
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'computeReplace',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.decline).toBe(true)
    const leaf = result!.alternativeFlow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('bake-bread')
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('computeReplace is silent when trueAction=false', () => {
    const listener = findListener('C140-packaging-artist-replace-minor-improvement')
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'computeReplace',
      trueAction: false,
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  // BGA: onPlayerIsDoable forces minor-improvement to be doable when player
  // has any "real" minor action context (the card replaces it with bake-bread,
  // which is always doable as long as the player can bake — the listener
  // returns `doable: true` so the underlying minor-improvement action stays
  // enabled even if the player has no minor cards in hand).
  it('isDoable: minor-improvement stays doable even with no minor cards', () => {
    const listener = findListener('C140-packaging-artist-isdoable-minor-improvement')
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.minorHand = [] // no minor cards
    session.loadState(state)

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext)
    expect(result?.doable).toBe(true)
  })

  it('isDoable is silent when trueAction=false', () => {
    const listener = findListener('C140-packaging-artist-isdoable-minor-improvement')
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.minorHand = []
    session.loadState(state)

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'isDoable',
      doable: false,
      trueAction: false,
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('isDoable: keeps doable=true unchanged when already doable', () => {
    const listener = findListener('C140-packaging-artist-isdoable-minor-improvement')
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'isDoable',
      doable: true,
    } as unknown as CardListenerContext)
    // No-op when already doable (don't override true with anything)
    expect(result === undefined || result.doable === true).toBe(true)
  })

  it('computeReplace fires on improvement-any too (Major Improvement space)', () => {
    const listener = findListener('C140-packaging-artist-replace-minor-improvement')
    expect(listener).toBeDefined()
    // Registration shape: listener must be registered on improvement-any.
    expect(listener!.actions).toContain('improvement-any')

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement-any',
      phase: 'computeReplace',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.decline).toBe(true)
    const leaf = result!.alternativeFlow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('bake-bread')
    expect(leaf.sourceCard).toBe(CARD_ID)
  })
})
