import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D109_SowingMaster'

const CARD_ID = 'D109_SowingMaster'

describe('D109_SowingMaster session', () => {
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

  it('onBuy grants 1 wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('gain')
    expect((flow as any).params).toEqual({ wood: 1 })
  })

  it('gains 2 food when using grain-utilization', () => {
    const session = setup()
    const state = session.getState().state
    // Grain utilization requires grain in hand and a field to sow
    const player = state.players[0]!
    player.resources.grain = 2
    player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
    session.loadState(state)

    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)

    // grain-utilization may require sowing choices — handle them
    while (resp.pending.type === 'choice') {
      const nonSkip = resp.pending.options?.find((o: any) => o.value !== '__skip__')
      if (nonSkip) {
        resp = session.resolveChoice(0, nonSkip.value)
      } else {
        resp = session.resolveChoice(0, '__skip__')
      }
    }
    // Handle farm selections if needed
    if (resp.interaction?.stateId === 'farmSelect') {
      resp = session.commitFarmChoice(0, 'sow', { sow: [{ row: 0, col: 0, crop: 'grain' }] })
    }

    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(foodBefore + 2)
  })

  it('does not trigger on non-matching action spaces', () => {
    const session = setup()
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    // Day laborer gives food but SowingMaster should NOT add extra 2 food
    // Day laborer gives 2 food normally, so check relative to that
    expect(after.players[0]!.resources.food).toBe(foodBefore + 2) // only day-laborer food
  })
})
