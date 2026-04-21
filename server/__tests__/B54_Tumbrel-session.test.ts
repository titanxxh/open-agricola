import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/B/B54_Tumbrel'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'B54_Tumbrel'

describe('B54_Tumbrel session', () => {
  it('onBuy returns a gain-2-food flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('sow listener fires and gains food per stable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]

    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    session.loadState(state)

    // Find the Tumbrel sow listener
    const listener = getRegisteredCardListeners().find(
      (reg) => reg.id === 'B54-tumbrel-after-sow',
    )
    expect(listener).toBeDefined()

    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'sow',
      phase: 'after',
      result: { type: 'ok' },
    }

    const result = executeCardListener(listener!, context)
    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('sow listener does not fire with 0 stables', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = []

    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    session.loadState(state)

    const listener = getRegisteredCardListeners().find(
      (reg) => reg.id === 'B54-tumbrel-after-sow',
    )
    expect(listener).toBeDefined()

    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'sow',
      phase: 'after',
      result: { type: 'ok' },
    }

    const result = executeCardListener(listener!, context)
    expect(result).toBeUndefined()
  })


  it('sow listener gains 3 food with 3 stables', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }]

    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    session.loadState(state)

    const listener = getRegisteredCardListeners().find(
      (reg) => reg.id === 'B54-tumbrel-after-sow',
    )
    expect(listener).toBeDefined()

    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'sow',
      phase: 'after',
      result: { type: 'ok' },
    }

    const result = executeCardListener(listener!, context)
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(3)
  })
})
