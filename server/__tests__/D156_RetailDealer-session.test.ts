import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/game/player'
import { confirmNextPlayer } from './_helpers/legacy-confirms'

import '../../shared/cards/D/D156_RetailDealer'

describe('D156_RetailDealer session', () => {
  /**
   * Setup with D156_RetailDealer already played.
   * Keep a 4-player board so resource-market-4 exists, but disable extra workers
   * for players 3/4 so turn order still only rotates across the first two seats.
   */
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push('D156_RetailDealer')
    if (!player.cardStates) player.cardStates = {}
    player.cardStates['D156_RetailDealer'] = {
      extraData: { remaining: 3 },
    }
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

    session.loadState(state)
    return session
  }

  it('initial remaining counter is 3', () => {
    const session = setup()
    const state = session.getState().state
    const remaining = readCardExtraData<number>(
      state.players[0]!, 'D156_RetailDealer', 'remaining',
    )
    expect(remaining).toBe(3)
  })

  it('using resource-market-4 gives extra grain and food from card', () => {
    const session = setup()
    const state = session.getState().state
    const p0 = state.players[0]!
    const initialGrain = p0.resources.grain
    const initialFood = p0.resources.food
    session.loadState(state)

    const resp = session.takeAction(0, 'resource-market-4')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // resource-market-4 gives reed:1, stone:1, food:1
    // card gives grain:1, food:1
    expect(p.resources.grain).toBe(initialGrain + 1)
    expect(p.resources.food).toBe(initialFood + 1 + 1) // base + card

    const remaining = readCardExtraData<number>(
      p, 'D156_RetailDealer', 'remaining',
    )
    expect(remaining).toBe(2)
  })

  it('counter decrements each use until exhausted', () => {
    const session = setup()

    // First use
    let resp = session.takeAction(0, 'resource-market-4')
    expect(resp.ok).toBe(true)
    let remaining = readCardExtraData<number>(
      resp.state.players[0]!, 'D156_RetailDealer', 'remaining',
    )
    expect(remaining).toBe(2)

    // Advance turn: p1 takes an action, then p0 gets another turn
    resp = confirmNextPlayer(session)
    resp = session.takeAction(1, 'grain-seeds')
    if (resp.pending.type === 'choice') {
      resp = session.resolveChoice(1, '__skip__')
    }
    resp = confirmNextPlayer(session)

    // Reset resource-market-4 for re-use
    const state2 = session.getState().state
    const rm = state2.actionSpaces.find(s => s.id === 'resource-market-4')
    if (rm) rm.takenBy = []
    session.loadState(state2)

    // Second use
    resp = session.takeAction(0, 'resource-market-4')
    expect(resp.ok).toBe(true)
    remaining = readCardExtraData<number>(
      resp.state.players[0]!, 'D156_RetailDealer', 'remaining',
    )
    expect(remaining).toBe(1)

    // Advance turn again
    resp = confirmNextPlayer(session)
    resp = session.takeAction(1, 'farmland')
    const tile = resp.interaction?.farm?.selectableTiles?.[0]
    if (tile) resp = session.resolveChoice(1, 'confirm', { tile })
    resp = confirmNextPlayer(session)

    // Reset resource-market-4 again
    const state3 = session.getState().state
    const rm3 = state3.actionSpaces.find(s => s.id === 'resource-market-4')
    if (rm3) rm3.takenBy = []
    session.loadState(state3)

    // Third use
    resp = session.takeAction(0, 'resource-market-4')
    expect(resp.ok).toBe(true)
    remaining = readCardExtraData<number>(
      resp.state.players[0]!, 'D156_RetailDealer', 'remaining',
    )
    expect(remaining).toBe(0)
  })

  it('no bonus when counter is zero', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.cardStates!['D156_RetailDealer']!.extraData!.remaining = 0
    const initialGrain = state.players[0]!.resources.grain
    const initialFood = state.players[0]!.resources.food
    session.loadState(state)

    const resp = session.takeAction(0, 'resource-market-4')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Only base gain from resource-market-4: food:1 (no grain, no extra food)
    expect(p.resources.grain).toBe(initialGrain)
    expect(p.resources.food).toBe(initialFood + 1) // just base food
  })

  it('other action spaces do not trigger bonus', () => {
    const session = setup()
    const state = session.getState().state
    session.loadState(state)

    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const remaining = readCardExtraData<number>(
      resp.state.players[0]!, 'D156_RetailDealer', 'remaining',
    )
    // Counter unchanged
    expect(remaining).toBe(3)
  })
})
