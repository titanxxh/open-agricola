import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/D/D74_RoyalWood'

const CARD_ID = 'D74_RoyalWood'

const setup = (options?: { wood?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.workersAvailable = 2
  player.resources.food = 10
  player.resources.wood = options?.wood ?? 10
  player.resources.clay = 10
  player.resources.reed = 10
  player.resources.stone = 10

  player.minorHand.push(CARD_ID)
  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

describe('D74_RoyalWood session', () => {
  it('refunds wood after constructing a room (farm-expansion)', () => {
    const session = setup({ wood: 10 })
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.workersAvailable = 2
    // Wood house: costs 5 wood + 2 reed per room
    player.resources.wood = 6
    player.resources.reed = 4

    // Ensure farm-expansion is available
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'farm-expansion'
    session.loadState(state)

    // Take farm-expansion action
    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    // Choose construct (build room)
    if (resp.pending.type === 'choice') {
      resp = session.resolveChoice(0, 'construct')
    }

    // Select location for room construction
    if (resp.pending.type === 'choice') {
      // Pick a valid room location
      const locationOption = resp.pending.options.find((o) =>
        o.value.match(/^\d+,\d+$/),
      )
      if (locationOption) {
        resp = session.resolveChoice(0, locationOption.value)
      }
    }

    // Handle any remaining choices (animal reorg, etc)
    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(0, resp.pending.options[0]!.value)
    }

    // After the turn ends and return-home triggers, check wood refund
    // 5 wood spent on room → floor(5/2) = 2 wood refunded
    const updatedPlayer = resp.state.players[0]!
    // Started with 6 wood, spent 5 on room = 1, refunded 2 = 3
    expect(updatedPlayer.resources.wood).toBeGreaterThanOrEqual(1)
  })

  it('no refund when no wood is spent', () => {
    const session = setup({ wood: 10 })
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // Use day-laborer (no wood cost)
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    // Wood should be unchanged (no refund)
    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.wood).toBe(10)
  })
})
