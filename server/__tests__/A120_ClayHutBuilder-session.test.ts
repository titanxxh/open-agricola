import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { resolveFutureMeepleRequests } from '../../shared/actions/effects/internal/future-meeples'
import { applyFutureMeeples } from '../../shared/logic/state'

import '../../shared/cards/A/A120_ClayHutBuilder'

describe('A120_ClayHutBuilder session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone'; round?: number }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = options?.round ?? 1

    const player = state.players[0]!
    player.occupationHand.push('A120_ClayHutBuilder')
    player.houseType = options?.houseType ?? 'wood'
    session.loadState(state)
    session.devPlayCard(0, 'A120_ClayHutBuilder')
    return session
  }

  it('onBuy does nothing when player lives in wooden house', () => {
    const session = setup({ houseType: 'wood' })
    const state = session.getState().state

    expect(state.pendingFutureMeeples.length).toBe(0)
    expect(isCardFlagged(state.players[0]!, 'A120_ClayHutBuilder')).toBe(false)
  })

  it('onBuy queues 5 rounds of 2 clay when player has clay house', () => {
    const session = setup({ houseType: 'clay', round: 3 })
    const state = session.getState().state

    expect(state.pendingFutureMeeples.length).toBe(1)
    expect(state.pendingFutureMeeples[0]).toMatchObject({
      cardId: 'A120_ClayHutBuilder',
      playerId: state.players[0]!.id,
      startRound: 4,
      count: 5,
      resources: { clay: 2 },
    })
    expect(isCardFlagged(state.players[0]!, 'A120_ClayHutBuilder')).toBe(true)

    resolveFutureMeepleRequests(state)
    expect(state.futureMeeples).toHaveLength(5)
    expect(state.futureMeeples.map((e) => e.round)).toEqual([4, 5, 6, 7, 8])
    state.futureMeeples.forEach((entry) => {
      expect(entry.resources).toEqual({ clay: 2 })
    })
  })

  it('onBuy queues 2 clay when player has stone house', () => {
    const session = setup({ houseType: 'stone', round: 1 })
    const state = session.getState().state

    expect(state.pendingFutureMeeples.length).toBe(1)
    expect(isCardFlagged(state.players[0]!, 'A120_ClayHutBuilder')).toBe(true)
  })

  it('clay is collected at round start', () => {
    const session = setup({ houseType: 'clay', round: 1 })
    const state = session.getState().state
    const player = state.players[0]!
    const clayBefore = player.resources.clay

    resolveFutureMeepleRequests(state)
    state.round = 2
    applyFutureMeeples(state)

    expect(player.resources.clay).toBe(clayBefore + 2)
    expect(state.futureMeeples).toHaveLength(4)
  })

  it('after renovation from wood to clay, triggers and places future meeples', () => {
    const session = setup({ houseType: 'wood', round: 5 })
    const state = session.getState().state
    const player = state.players[0]!

    // Ensure not flagged yet
    expect(isCardFlagged(player, 'A120_ClayHutBuilder')).toBe(false)
    expect(state.pendingFutureMeeples.length).toBe(0)

    // Set up renovation resources: wood house -> clay house needs clay=rooms + 1 reed
    player.resources.clay = player.rooms + 10
    player.resources.reed = 10

    // Make house-redevelopment action space available
    const houseRedevSpace = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
    if (houseRedevSpace) {
      houseRedevSpace.roundAvailable = 1
      houseRedevSpace.takenBy = []
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!
    expect(updatedPlayer.houseType).not.toBe('wood')
    expect(isCardFlagged(updatedPlayer, 'A120_ClayHutBuilder')).toBe(true)
    // Future meeples should be queued or resolved
    const clayEntries = updatedState.futureMeeples.filter(
      (e) => e.cardId === 'A120_ClayHutBuilder',
    )
    expect(clayEntries.length).toBeGreaterThan(0)
  })

  it('does not trigger twice (card is flagged after first activation)', () => {
    const session = setup({ houseType: 'clay', round: 3 })
    const state = session.getState().state

    // Already triggered onBuy: flagged
    expect(isCardFlagged(state.players[0]!, 'A120_ClayHutBuilder')).toBe(true)
    resolveFutureMeepleRequests(state)
    const count = state.futureMeeples.length

    // Set up renovation
    const player = state.players[0]!
    player.resources.stone = player.rooms + 10
    player.resources.reed = 10

    const farmRedevSpace = state.actionSpaces.find((s) => s.id === 'farm-redevelopment')
    if (farmRedevSpace) {
      farmRedevSpace.roundAvailable = 1
      farmRedevSpace.takenBy = []
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'farm-redevelopment')
    if (resp.ok) {
      const updatedState = session.getState().state
      const newEntries = updatedState.futureMeeples.filter(
        (e) => e.cardId === 'A120_ClayHutBuilder',
      )
      // Should not have added more entries
      expect(newEntries.length).toBeLessThanOrEqual(count)
    }
  })
})
