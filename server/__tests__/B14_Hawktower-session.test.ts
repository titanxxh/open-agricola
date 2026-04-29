import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { getCardEffect } from '../../shared/cards/card-effects'
import {
  futureMeeplesAction,
  resolveFutureMeepleRequests,
} from '../../shared/actions/effects/future-meeples'
import '../../shared/cards/B/B14_Hawktower'

const CARD_ID = 'B14_Hawktower'

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
  it('houseType=stone: gains 1 room after round-12 future-meeple trigger', () => {
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
    futureMeeplesAction.execute({ state, params: {} } as never)

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
    futureMeeplesAction.execute({ state, params: {} } as never)

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
    futureMeeplesAction.execute({ state, params: {} } as never)

    expect(player.rooms).toBe(beforeRooms)
    expect(player.roomTiles.length).toBe(beforeTiles)
  })
})
