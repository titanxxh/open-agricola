import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

import '../../shared/cards/C/C021_HeartofStone'
import '../../shared/cards/D/D010_StorksNest'

const FILLER = '__test_placeholder__'
const PLAYABLE_MINOR = 'A006_StorageBarn'

const setupRoundEnd = (cardId: 'C021_HeartofStone' | 'D010_StorksNest', round: number) => {
  const session = new GameSession(2110, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = round
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    markAllWorkersUsed(state, player)
    player.resources.food = 20
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorPlayed = [cardId]
  player.minorHand = [PLAYABLE_MINOR]
  player.rooms = 3
  player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
  session.loadState(state)
  return session
}

const acceptCardChoice = (
  session: GameSession,
  response: SessionResponse,
  cardId: 'C021_HeartofStone' | 'D010_StorksNest',
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error(`expected ${cardId} choice`)
  expect(response.interaction.sourceCard).toBe(cardId)
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

describe('card-granted family growth does not expand Wish for Children', () => {
  it('C021 accepts its Quarry reveal growth without granting a minor improvement', () => {
    const session = setupRoundEnd('C021_HeartofStone', 5)
    session.state.roundActionOrder[5] = 'western-quarry'
    session.loadState(session.state)

    const response = acceptCardChoice(session, session.performRoundEnd(), 'C021_HeartofStone')

    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.minorHand).toContain(PLAYABLE_MINOR)
  })

  it('D010 pays one food for return-home growth without granting a minor improvement', () => {
    const session = setupRoundEnd('D010_StorksNest', 5)
    const beforeFood = session.state.players[0]!.resources.food

    const response = acceptCardChoice(session, session.performRoundEnd(), 'D010_StorksNest')

    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(beforeFood - 1)
    expect(response.state.players[0]!.minorHand).toContain(PLAYABLE_MINOR)
  })
})
