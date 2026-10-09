import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/C/C156_HoofCaregiver'

const CARD_ID = 'C156_HoofCaregiver'

describe('C156_HoofCaregiver session', () => {
  it('onBuy adds 1 cattle to cattle-market space and gains N grain + N food', () => {
    // The reference `C156_HoofCaregiver::onBuy`:
    //   1. SPECIAL_EFFECT placeCattle('ActionCattleMarket') — +1 cattle to space
    //   2. gainNode([GRAIN => N, FOOD => N]) where N = cattle on space (after +1)
    // Our previous impl hard-coded gain {grain: 1, food: 1} and skipped the
    // space mutation entirely.
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const cattleMarketRound = state.roundActionOrder.indexOf('cattle-market') + 1
    if (cattleMarketRound <= 0) throw new Error('cattle-market round slot missing')
    state.round = cattleMarketRound
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // cattle-market is a stage-4 round space present in every player count.
    // Pre-seed it with 2 cattle so we can verify the +1 add and the dynamic N.
    const cattleMarket = state.actionSpaces.find((s) => s.id === 'cattle-market')!
    expect(cattleMarket).toBeDefined()
    cattleMarket.resources.cattle = 2
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player) as ActionFlow

    // After onBuy: cattle-market has 3 cattle (2 + 1 placed)
    const cm = state.actionSpaces.find((s) => s.id === 'cattle-market')!
    expect(cm.resources.cattle).toBe(3)

    // Returned flow: gain {grain: 3, food: 3} (matching N=3)
    expect(flow).toBeDefined()
    // Could be a gain leaf or seq containing one — accept either
    const leafFlow =
      flow.type === 'leaf'
        ? flow
        : (flow as Extract<ActionFlow, { type: 'seq' }>).children.find(
            (c): c is Extract<ActionFlow, { type: 'leaf' }> =>
              c.type === 'leaf' && c.actionId === 'gain',
          )
    expect(leafFlow).toBeDefined()
    expect(leafFlow!.params).toMatchObject({ grain: 3, food: 3 })
  })

  it('onBuy returns undefined when cattle-market exists but is not revealed', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    const cattleMarketRound = state.roundActionOrder.indexOf('cattle-market') + 1
    if (cattleMarketRound <= 0) throw new Error('cattle-market round slot missing')
    state.round = cattleMarketRound - 1
    const cattleMarket = state.actionSpaces.find((s) => s.id === 'cattle-market')!
    expect(cattleMarket).toBeDefined()
    cattleMarket.resources.cattle = 2
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
    expect(cattleMarket.resources.cattle).toBe(2)
  })
})
