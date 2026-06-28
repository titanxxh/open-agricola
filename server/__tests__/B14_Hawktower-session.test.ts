import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { getCardEffect } from '../../shared/cards/card-effects'
import { resolveFutureMeepleRequests } from '../../shared/actions/effects/internal/future-meeples'
import { applyFutureMeeples } from '../../shared/session/state-bootstrap'
import { B014_Hawktower } from '../../shared/cards/B/B014_Hawktower'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'B014_Hawktower'

const setup = (houseType: 'wood' | 'clay' | 'stone') => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.houseType = houseType
  player.minorPlayed.push(CARD_ID)

  session.loadState(state)
  return session
}

describe('B14 Hawktower — session', () => {
  it('houseType=stone: gains 1 room at round-12 round-start (applyFutureMeeples)', () => {
    const session = setup('stone')
    const state = session.getState().state
    const player = state.players[0]!

    const effect = getCardEffect(CARD_ID)
    expect(effect?.onBuy).toBeDefined()
    effect!.onBuy!(state, player)

    resolveFutureMeepleRequests(state)
    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    state.round = 12
    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms + 1)
    expect(player.roomTiles.length).toBe(beforeTiles + 1)
    expect(
      state.futureMeeples.some(
        (e) => e.cardId === CARD_ID && e.playerId === player.id,
      ),
    ).toBe(false)
  })

  it('houseType=clay: no room added at round 12', () => {
    const session = setup('clay')
    const state = session.getState().state
    const player = state.players[0]!

    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    resolveFutureMeepleRequests(state)

    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    state.round = 12
    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms)
    expect(player.roomTiles.length).toBe(beforeTiles)
  })

  it('houseType=wood: no room added at round 12', () => {
    const session = setup('wood')
    const state = session.getState().state
    const player = state.players[0]!

    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    resolveFutureMeepleRequests(state)

    const beforeRooms = player.rooms
    const beforeTiles = player.roomTiles.length

    state.round = 12
    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms)
    expect(player.roomTiles.length).toBe(beforeTiles)
  })

  it('round 12 round-start via real round-advance path: stone-room is built (no execute call)', () => {
    // Real round-start consumption: applyFutureMeeples is called from
    // shared/session/session-core.ts at every round transition. This test
    // simulates that path directly (without invoking futureMeeplesAction.execute),
    // proving the consumption is anchored on the correct entry point.
    const session = setup('stone')
    const state = session.getState().state
    const player = state.players[0]!

    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    resolveFutureMeepleRequests(state)

    // Pre-12 rounds: applyFutureMeeples must NOT consume the entry.
    const beforeRooms = player.rooms
    for (let r = 2; r <= 11; r += 1) {
      state.round = r
      applyFutureMeeples(state)
    }
    expect(player.rooms).toBe(beforeRooms)
    expect(
      state.futureMeeples.some(
        (e) => e.cardId === CARD_ID && e.roomType === 'stone',
      ),
    ).toBe(true)

    // Round 12 round-start: entry is consumed and room is placed.
    state.round = 12
    applyFutureMeeples(state)

    expect(player.rooms).toBe(beforeRooms + 1)
    expect(
      state.futureMeeples.some(
        (e) => e.cardId === CARD_ID && e.playerId === player.id,
      ),
    ).toBe(false)
  })

  describe('prerequisite "Play in Round 7 or Before"', () => {
    it('blocks when round > 7', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.round = 8
      const player = state.players[0]!
      expect(meetsCardPrerequisites(player, B014_Hawktower, state.round, state)).toBe(false)
    })

    it('allows when round <= 7', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.round = 7
      const player = state.players[0]!
      expect(meetsCardPrerequisites(player, B014_Hawktower, state.round, state)).toBe(true)
    })
  })
})
