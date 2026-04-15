import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C121_ClayKneader'

const CARD_ID = 'C121_ClayKneader'

describe('C121_ClayKneader session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  it('onBuy grants 1 wood and 2 clay', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('gain')
    expect((flow as any).params).toEqual({ wood: 1, clay: 2 })
  })

  it('gains 1 clay when using grain-seeds', () => {
    const session = setup()
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay

    let resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    // +1 clay from ClayKneader
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
    // +1 grain from the action space
    expect(after.players[0]!.resources.grain).toBeGreaterThanOrEqual(1)
  })

  it('gains 1 clay when using vegetable-seeds', () => {
    const session = setup()
    const state = session.getState().state
    // vegetable-seeds requires round 3+
    state.round = 3
    session.loadState(state)

    const clayBefore = session.getState().state.players[0]!.resources.clay

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)

    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('does not trigger on non-matching action spaces', () => {
    const session = setup()
    const clayBefore = session.getState().state.players[0]!.resources.clay

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    // No clay gained from ClayKneader
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})
