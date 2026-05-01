import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { resolveFutureMeepleRequests } from '../../shared/actions/effects/internal/future-meeples'
import { applyFutureMeeples } from '../../shared/logic/state'

import '../../shared/cards/B/B107_Manservant'

describe('B107_Manservant session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone'; round?: number }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = options?.round ?? 1

    const player = state.players[0]!
    player.occupationHand.push('B107_Manservant')
    player.houseType = options?.houseType ?? 'wood'
    session.loadState(state)
    session.devPlayCard(0, 'B107_Manservant')
    return session
  }

  it('onBuy does nothing when player does not live in stone house', () => {
    const session = setup({ houseType: 'wood' })
    const state = session.getState().state
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('onBuy does nothing in clay house', () => {
    const session = setup({ houseType: 'clay' })
    const state = session.getState().state
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('onBuy queues food on remaining rounds when player lives in stone house', () => {
    const session = setup({ houseType: 'stone', round: 5 })
    const state = session.getState().state

    expect(state.pendingFutureMeeples.length).toBe(1)
    expect(state.pendingFutureMeeples[0]).toMatchObject({
      cardId: 'B107_Manservant',
      playerId: state.players[0]!.id,
      startRound: 6,
      count: 14,
      resources: { food: 3 },
    })

    resolveFutureMeepleRequests(state)
    // Rounds 6..14 = 9 rounds (clamped to 14)
    const entries = state.futureMeeples.filter(
      (e) => e.cardId === 'B107_Manservant',
    )
    expect(entries.length).toBe(9)
    entries.forEach((entry) => {
      expect(entry.resources).toEqual({ food: 3 })
    })
  })

  it('food is collected at round start', () => {
    const session = setup({ houseType: 'stone', round: 5 })
    const state = session.getState().state
    const player = state.players[0]!
    const foodBefore = player.resources.food

    resolveFutureMeepleRequests(state)
    state.round = 6
    applyFutureMeeples(state)

    expect(player.resources.food).toBe(foodBefore + 3)
  })

  it('after renovation to stone, triggers future food placement', () => {
    const session = setup({ houseType: 'clay', round: 5 })
    const state = session.getState().state
    const player = state.players[0]!

    // No pending yet (clay house at buy time)
    expect(state.pendingFutureMeeples.length).toBe(0)

    // Set up renovation from clay to stone
    player.resources.stone = player.rooms + 10
    player.resources.reed = 10

    const farmRedevSpace = state.actionSpaces.find((s) => s.id === 'farm-redevelopment')
    if (farmRedevSpace) {
      farmRedevSpace.roundAvailable = 1
      farmRedevSpace.takenBy = []
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'farm-redevelopment')
    expect(resp.ok).toBe(true)

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!

    if (updatedPlayer.houseType === 'stone') {
      // Future food meeples should exist
      const foodEntries = updatedState.futureMeeples.filter(
        (e) => e.cardId === 'B107_Manservant',
      )
      expect(foodEntries.length).toBeGreaterThan(0)
      foodEntries.forEach((entry) => {
        expect(entry.resources).toEqual({ food: 3 })
      })
    }
  })

  it('does not trigger when renovating to clay (not stone)', () => {
    const session = setup({ houseType: 'wood', round: 5 })
    const state = session.getState().state
    const player = state.players[0]!

    // Set up renovation from wood to clay
    player.resources.clay = player.rooms + 10
    player.resources.reed = 10

    const houseRedevSpace = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
    if (houseRedevSpace) {
      houseRedevSpace.roundAvailable = 1
      houseRedevSpace.takenBy = []
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const updatedState = session.getState().state
    const manservantEntries = updatedState.futureMeeples.filter(
      (e) => e.cardId === 'B107_Manservant',
    )
    expect(manservantEntries.length).toBe(0)
  })
})
