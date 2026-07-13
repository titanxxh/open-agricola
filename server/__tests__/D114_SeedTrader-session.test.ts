import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { AnytimeAction, ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/D/D114_SeedTrader'

const CARD_ID = 'D114_SeedTrader'

/**
 * D114 Seed Trader (Sprint 7a F5+F6).
 *
 * BGA `Cards/D/D114_SeedTrader.php`:
 *   onBuy: createResourceInLocation cardId for [GRAIN, GRAIN, VEG, VEG]
 *   isListeningTo: isAnytime && resources-on-card non-empty
 *   onPlayerAtAnytime: XOR (PAY food:2 → take 1 grain) | (PAY food:3 → take 1 veg)
 */
describe('D114_SeedTrader session', () => {
  const setup = (
    options?: { food?: number; grainOnCard?: number; vegOnCard?: number; play?: boolean },
  ) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = options?.food ?? 5
    player.cardStates ??= {}
    player.cardStates[CARD_ID] = {
      counters: {
        grain: options?.grainOnCard ?? 2,
        vegetable: options?.vegOnCard ?? 2,
      },
      extraData: {},
    }
    session.loadState(state)
    return session
  }

  it('onBuy returns store-on-card leaf with grain:2 + vegetable:2', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player) as Extract<ActionFlow, { type: 'leaf' }>
    expect(flow.type).toBe('leaf')
    expect(flow.actionId).toBe('store-on-card')
    expect(flow.params).toEqual({ grain: 2, vegetable: 2 })
    expect(flow.sourceCard).toBe(CARD_ID)
  })

  it('anytime listed when card has goods and food>=2', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('D114-seed-trader-anytime')
  })

  it('anytime hidden after card emptied', () => {
    const session = setup({ grainOnCard: 0, vegOnCard: 0 })
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D114-seed-trader-anytime')
  })

  it('anytime hidden when food < 2', () => {
    const session = setup({ food: 1 })
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D114-seed-trader-anytime')
  })

  it('anytime visible with food=2 and grain on card (only grain branch)', () => {
    const session = setup({ food: 2 })
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('D114-seed-trader-anytime')
  })

  it('triggering grain branch: pay 2 food, gain 1 grain, deplete card grain by 1', () => {
    const session = setup({ food: 2, grainOnCard: 2, vegOnCard: 0 })
    session.takeAction(0, 'farmland')
    const resp = session.takeAnytimeAction(0, 'D114-seed-trader-anytime')
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(0)
    expect(player.resources.grain).toBe(1)
    expect(player.cardStates?.[CARD_ID]?.counters?.grain).toBe(1)
  })

  it('not flag-gated: can be triggered multiple times same round', () => {
    const session = setup({ food: 4, grainOnCard: 2, vegOnCard: 0 })
    session.takeAction(0, 'farmland')
    const r1 = session.takeAnytimeAction(0, 'D114-seed-trader-anytime')
    expect(r1.ok).toBe(true)
    const r2 = session.takeAnytimeAction(0, 'D114-seed-trader-anytime')
    expect(r2.ok).toBe(true)
    const player = r2.state.players[0]!
    expect(player.resources.food).toBe(0)
    expect(player.resources.grain).toBe(2)
    expect(player.cardStates?.[CARD_ID]?.counters?.grain).toBe(0)
  })
})
