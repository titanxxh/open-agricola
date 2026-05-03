import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow, Resource } from '../../shared/game/types'

import '../../shared/cards/E/E78_SleightofHand'

const CARD_ID = 'E78_SleightofHand'

describe('E78_SleightofHand session', () => {
  const setupSession = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return { session, state }
  }

  it('onBuy offers optional exchange sequence when player has building resources', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 3
    player.resources.clay = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)

    // Should have 4 exchange children (up to 4 exchanges)
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children.length).toBe(4)

    // Each child is an XOR of pay-gain combos
    for (const child of children) {
      expect(child.type).toBe('xor')
      expect(child.optional).toBe(true)
      // 4 resource types * 3 other types = 12 combinations
      expect(child.children.length).toBe(12)
    }
  })

  it('onBuy returns undefined when player has no building resources', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 0
    player.resources.reed = 0
    player.resources.stone = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('each exchange option has correct pay-gain structure', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()

    const firstExchange = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0]
    expect(firstExchange.type).toBe('xor')

    // Check one option: pay 1 wood, gain 1 clay
    const woodToClayOption = firstExchange.children.find(
      (c: ActionFlow) =>
        c.type === 'seq' &&
        c.children[0].params?.wood === 1 &&
        c.children[1].params?.clay === 1,
    )
    expect(woodToClayOption).toBeDefined()
    expect(woodToClayOption.children[0].actionId).toBe('pay')
    expect(woodToClayOption.children[1].actionId).toBe('gain')
  })

  it('exchange options cover all 12 combinations (4 types x 3 other types)', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.stone = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)

    const firstExchange = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0]
    const combos = new Set<string>()
    for (const option of firstExchange.children) {
      const payKey = Object.keys(option.children[0].params)[0]
      const gainKey = Object.keys(option.children[1].params)[0]
      combos.add(`${payKey}->${gainKey}`)
    }

    // 4 building resources * 3 others = 12 combinations
    expect(combos.size).toBe(12)

    // Verify no same-type exchanges
    for (const combo of combos) {
      const [pay, gain] = combo.split('->')
      expect(pay).not.toBe(gain)
    }
  })
})
