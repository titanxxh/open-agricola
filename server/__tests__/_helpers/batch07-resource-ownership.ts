import { GameSession, type SessionResponse } from '../../game/authoritative-session'
import { setWorkersAtHome } from '../../../shared/domain/player'
import { stabilizeRandomHands } from './stabilize-random-hands'

export const resourceOptions = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

export const setupResourceAction = (cardId: string, spaceId: string) => {
  const session = new GameSession(7038, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  state.players[0]!.minorPlayed = [cardId]
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
  space.resources = { ...space.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0 }
  session.loadState(state)
  return session
}
