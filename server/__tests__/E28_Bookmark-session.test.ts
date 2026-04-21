import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E28_Bookmark'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'E28_Bookmark'

describe('E28_Bookmark session', () => {
  const setup = (playRound = 1) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = playRound

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Manually trigger onBuy
    runCardEffectHook(state, player, CARD_ID, 'onBuy')

    session.loadState(state)
    return session
  }

  it('onBuy stores triggerRound = round + 3', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!
    const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
    expect(triggerRound).toBe(5)
  })

  it('onBuy clamps triggerRound to max 14', () => {
    const session = setup(13)
    const state = session.getState().state
    const player = state.players[0]!
    const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
    expect(triggerRound).toBe(14)
  })

  it('at trigger round, offers free occupation play', () => {
    const session = setup(1) // triggerRound = 4
    const state = session.getState().state
    state.round = 4

    // Give occupation in hand
    const player = state.players[0]!
    player.occupationHand.push('A97_Freshman')

    session.loadState(state)

    // Trigger onBeforeStartOfTurn by calling it directly
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    if (flow!.type === 'seq') {
      expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
      const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children as any[]
      expect(children[0].actionId).toBe('play-occupation')
      expect(children[0].params.costOverride).toEqual({})
    }
  })

  it('does not trigger on non-trigger round', () => {
    const session = setup(1) // triggerRound = 4
    const state = session.getState().state
    state.round = 3

    const player = state.players[0]!
    player.occupationHand.push('A97_Freshman')

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('does not trigger when no occupations in hand', () => {
    const session = setup(1) // triggerRound = 4
    const state = session.getState().state
    state.round = 4

    const player = state.players[0]!
    player.occupationHand = []

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })
})
