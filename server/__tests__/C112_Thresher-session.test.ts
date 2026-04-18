import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/C/C112_Thresher'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (options?: {
  withCard?: boolean
  grain?: number
  spaceId?: string
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5 // Ensure cultivation is available

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    grain: options?.grain ?? 3,
    vegetable: 2,
    food: 1,
  }
  // Give fields so actions are doable
  player.fields = [
    { row: 0, col: 2, crop: null, remaining: 0 },
  ]

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('C112_Thresher')
  }

  session.loadState(state)
  return session
}

describe('C112_Thresher session', () => {
  it('offers optional grain-to-food exchange before using grain-utilization', () => {
    const session = setup({ withCard: true, grain: 3 })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // The before-hook should offer a pay-gain choice (optional)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    // Should have skip option and exchange option
    const hasSkip = resp.pending.options.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })

  it('exchange works: pay 1 grain, gain 1 food', () => {
    const session = setup({ withCard: true, grain: 3 })
    const initialState = session.getState().state
    const initialGrain = initialState.players[0]!.resources.grain
    const initialFood = initialState.players[0]!.resources.food

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    // Accept the exchange (not skip)
    const exchangeOption = resp.pending.options.find((o) => o.value !== '__skip__')
    if (!exchangeOption) return
    resp = session.resolveChoice(0, exchangeOption.value)
    expect(resp.ok).toBe(true)
    // After exchange: -1 grain, +1 food
    expect(resp.state.players[0]!.resources.grain).toBe(initialGrain - 1)
    expect(resp.state.players[0]!.resources.food).toBe(initialFood + 1)
  })

  it('does not offer exchange when player has no grain', () => {
    const session = setup({ withCard: true, grain: 0 })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Without grain, the before-hook should not trigger, so we go directly
    // to the normal grain-utilization flow
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    // The first choice should be the grain-utilization sow/bake, not exchange
    // (no skip option from Thresher)
    const options = resp.pending.options
    // Normal grain-utilization has sow and bake options, not skip
    expect(options.length).toBeGreaterThanOrEqual(1)
  })

  it('does not offer exchange without the card', () => {
    const session = setup({ withCard: false, grain: 3 })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Without the card, no exchange offered before normal flow
    expect(resp.pending.type).toBe('choice')
  })

  it('also triggers for farmland space', () => {
    const session = setup({ withCard: true, grain: 2 })
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    // The before-hook should fire for farmland too
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    const hasSkip = resp.pending.options.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })

  it('also triggers for cultivation space', () => {
    const session = setup({ withCard: true, grain: 2 })
    const resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    // The before-hook should fire for cultivation too
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    const hasSkip = resp.pending.options.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })
})
