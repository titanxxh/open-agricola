import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E111_Recluse'

describe('E111_Recluse session', () => {
  const setup = (options?: { withMinor?: boolean }) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('E111_Recluse')
    player.resources.food = 0
    player.resources.wood = 0
    if (options?.withMinor) {
      player.minorPlayed.push('STUB_MINOR')
    }
    session.loadState(state)
    session.devPlayCard(0, 'E111_Recluse')
    return session
  }

  it('onRoundStart grants 1 food when no minor improvements played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.minorPlayed.length).toBe(0)

    const flow = runCardEffectHook(state, player, 'E111_Recluse', 'onRoundStart')
    expect(flow).not.toBeNull()
    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 1 },
      sourceCard: 'E111_Recluse',
    })
  })

  it('onRoundStart does NOT grant food when minor improvements are played', () => {
    const session = setup({ withMinor: true })
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.minorPlayed.length).toBe(1)

    const flow = runCardEffectHook(state, player, 'E111_Recluse', 'onRoundStart')
    expect(flow).toBeNull()
  })

  it('onStartHarvest grants 1 wood when no minor improvements played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.minorPlayed.length).toBe(0)

    const flow = runCardEffectHook(state, player, 'E111_Recluse', 'onStartHarvest')
    expect(flow).not.toBeNull()
    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { wood: 1 },
      sourceCard: 'E111_Recluse',
    })
  })

  it('onStartHarvest does NOT grant wood when minor improvements are played', () => {
    const session = setup({ withMinor: true })
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'E111_Recluse', 'onStartHarvest')
    expect(flow).toBeNull()
  })

  it('stops granting benefits after a minor improvement is played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Initially no minors → should grant food
    let flow = runCardEffectHook(state, player, 'E111_Recluse', 'onRoundStart')
    expect(flow).not.toBeNull()

    // Play a minor improvement
    player.minorPlayed.push('STUB_MINOR')

    // Should no longer grant food
    flow = runCardEffectHook(state, player, 'E111_Recluse', 'onRoundStart')
    expect(flow).toBeNull()

    // Should no longer grant wood at harvest
    flow = runCardEffectHook(state, player, 'E111_Recluse', 'onStartHarvest')
    expect(flow).toBeNull()
  })
})
