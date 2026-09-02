import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C123_Freemason'

const CARD_ID = 'C123_Freemason'

const setupRoundStart = (houseType: 'wood' | 'clay' | 'stone', roomCount = 2) => {
  const session = new GameSession(123, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    markAllWorkersUsed(state, player)
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [CARD_ID]
  owner.houseType = houseType
  owner.rooms = roomCount
  owner.roomTiles = Array.from({ length: roomCount }, (_, index) => ({ row: index, col: 0 }))
  owner.resources = { ...owner.resources, clay: 0, stone: 0 }
  session.loadState(state)
  return session
}

describe('C123 Freemason parity', () => {
  it('C123 S1: playing Freemason through Lessons keeps the occupation in play', () => {
    const session = new GameSession(1231, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.occupationHand = ['__test_placeholder__']
      player.minorHand = ['__test_placeholder__']
    })
    state.players[0]!.occupationHand = [CARD_ID]
    session.loadState(state)

    const response = session.takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C123 S2: exactly two clay rooms grant two clay at the next work phase', () => {
    const response = setupRoundStart('clay').performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, stone: 0 })
  })

  it('C123 S3: exactly two stone rooms grant two stone at the next work phase', () => {
    const response = setupRoundStart('stone').performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 2 })
  })

  it('C123 S4: exactly two wooden rooms grant no building resources', () => {
    const response = setupRoundStart('wood').performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0 })
  })

  it('C123 S5: three clay rooms grant no clay', () => {
    const response = setupRoundStart('clay', 3).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
})
