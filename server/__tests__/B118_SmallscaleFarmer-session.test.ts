import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B118_SmallscaleFarmer'

const CARD_ID = 'B118_SmallscaleFarmer'

const setup = (roomCount = 2, inHand = false) => {
  const session = new GameSession(118, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player) => setWorkersAtHome(state, player, 2))
  const player = state.players[0]!
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources.wood = 0
  player.rooms = roomCount
  player.roomTiles = Array.from({ length: roomCount }, (_, col) => ({ row: 0, col }))
  session.loadState(state)
  return session
}

const finishRound = (session: GameSession) => {
  session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
  return session.performRoundEnd()
}

describe('B118 Small-scale Farmer parity', () => {
  it('B118 S1: playing Small-scale Farmer through Lessons keeps the occupation in play', () => {
    const response = setup(2, true).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B118 S2: exactly two house rooms grant one wood at the next round start', () => {
    const response = finishRound(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('B118 S3: three house rooms grant no wood at the next round start', () => {
    const response = finishRound(setup(3))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('B118 S4: two consecutive round starts each grant one wood', () => {
    const session = setup()

    expect(finishRound(session).ok).toBe(true)
    const response = finishRound(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })
})
