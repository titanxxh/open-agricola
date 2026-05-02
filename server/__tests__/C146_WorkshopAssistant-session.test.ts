import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import {
  C146_WorkshopAssistant_impl,
} from '../../shared/cards/C/C146_WorkshopAssistant'
import { setStoredResource } from '../../shared/cards/helpers/card-storage'
import type { ActionFlow } from '../../shared/game/types'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C146_WorkshopAssistant'

/**
 * C146 Workshop Assistant (verify-only, Sprint 7a F1+F11).
 *
 * BGA `C146_WorkshopAssistant::onBuy`:
 *   - n = min(6, countAllImprovements())
 *   - n >= 6: auto-place all 6 pairs
 *   - else:  emit SE choosePairs prompting the owner to pick exactly n
 *            unique pairs from the 6 possible building-resource pairs.
 *
 * We auto-pick the first n pairs in fixed order (WC, WR, WS, CR, CS, RS).
 * BGA-incorrect when n < 6 because the player doesn't choose. Implementing
 * the multi-select pair-picker requires:
 *   1. New flow node type or extension of ChoiceNode to a pick-K-of-N pending.
 *   2. UI support in InteractionBar / pending-choice rendering.
 *   3. game-core handling for the multi-select resolveChoice path.
 * All main-path schema changes — deliberately deferred (see card_progress
 * §刻意不同 / Sprint 7b).
 *
 * BGA `C146::onOpponentAfterRenovation` lets the owner take 1 of the
 * available pairs. Our after-renovate listener (scope: opponent, action:
 * renovate-house) emits an optional take-from-card flow per available pair.
 *
 * This test pins the deliberate-divergence onBuy and the after-renovate
 * listener shape.
 */
describe('C146_WorkshopAssistant session (verify-only)', () => {
  it('onBuy auto-picks first n pairs as a single store-on-card leaf (n=2)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C146_WorkshopAssistant')
    player.minorPlayed.push('FAKE_MINOR_1')
    player.minorPlayed.push('FAKE_MINOR_2')
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C146_WorkshopAssistant', 'onBuy')
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.children).toHaveLength(1)
    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('store-on-card')
    expect(leaf.sourceCard).toBe('C146_WorkshopAssistant')
    // n=2 → first two pairs WC + WR → wood:2, clay:1, reed:1
    expect(leaf.params).toEqual({ wood: 2, clay: 1, reed: 1 })
  })

  it('onBuy returns null when player has no improvements', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C146_WorkshopAssistant')
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C146_WorkshopAssistant', 'onBuy')
    expect(flow).toBeNull()
  })

  it('onBuy clamps n to 6 with full 6-pair distribution', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C146_WorkshopAssistant')
    // 8 improvements > 6 cap
    for (let i = 0; i < 8; i++) {
      player.minorPlayed.push(`FAKE_MINOR_${i}`)
    }
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C146_WorkshopAssistant', 'onBuy')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    // All 6 pairs: each resource appears in 3 pairs.
    expect(leaf.params).toEqual({ wood: 3, clay: 3, reed: 3, stone: 3 })
  })

  it('after-renovate listener offers single available pair as optional take-from-card', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed.push('C146_WorkshopAssistant')
    setStoredResource(owner, 'C146_WorkshopAssistant', 'wood', 1)
    setStoredResource(owner, 'C146_WorkshopAssistant', 'clay', 1)
    session.loadState(state)

    const listener = C146_WorkshopAssistant_impl.listeners![0]!
    const ctx: CardListenerContext = {
      state,
      player: opponent,
      actionId: 'renovate-house',
      phase: 'after',
    }
    const result = listener.handler(ctx)
    expect(result).toBeTruthy()
    if (!result || typeof result !== 'object' || !('flow' in result)) {
      throw new Error('expected ActionHookResult with flow')
    }
    expect(result.sourceCard).toBe('C146_WorkshopAssistant')
    const seq = result.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('take-from-card')
    expect(leaf.params).toEqual({ wood: 1, clay: 1 })
    expect(leaf.sourceCard).toBe('C146_WorkshopAssistant')
  })

  it('after-renovate listener offers xor when 2+ pairs available', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed.push('C146_WorkshopAssistant')
    setStoredResource(owner, 'C146_WorkshopAssistant', 'wood', 1)
    setStoredResource(owner, 'C146_WorkshopAssistant', 'clay', 1)
    setStoredResource(owner, 'C146_WorkshopAssistant', 'reed', 1)
    session.loadState(state)

    const listener = C146_WorkshopAssistant_impl.listeners![0]!
    const ctx: CardListenerContext = {
      state,
      player: opponent,
      actionId: 'renovate-house',
      phase: 'after',
    }
    const result = listener.handler(ctx)
    if (!result || typeof result !== 'object' || !('flow' in result)) {
      throw new Error('expected ActionHookResult with flow')
    }
    const xor = result.flow as Extract<ActionFlow, { type: 'xor' }>
    expect(xor.type).toBe('xor')
    expect(xor.optional).toBe(true)
    // wood/clay, wood/reed, clay/reed → 3 pair seqs
    expect(xor.children).toHaveLength(3)
  })

  it('after-renovate listener returns void when owner has no pair stored', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed.push('C146_WorkshopAssistant')
    session.loadState(state)

    const listener = C146_WorkshopAssistant_impl.listeners![0]!
    const ctx: CardListenerContext = {
      state,
      player: opponent,
      actionId: 'renovate-house',
      phase: 'after',
    }
    const result = listener.handler(ctx)
    expect(result).toBeFalsy()
  })
})
