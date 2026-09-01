import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { familySize, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E113_Godmother'

const CARD_ID = 'E113_Godmother'

const setup = (round: number, rooms: number) => {
  const session = new GameSession(374)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((entry, index) => setWorkersAtHome(state, entry, index === 0 ? 2 : 0))
  const player = state.players[0]!
  player.rooms = rooms
  player.occupationPlayed.push(CARD_ID)
  session.loadState(state)
  return session
}

describe('E113 Godmother native session', () => {
  it('gains exactly 1 vegetable after Family Growth with room', () => {
    const session = setup(2, 3)
    const player = session.state.players[0]!
    const familyBefore = familySize(player)
    const vegetablesBefore = player.resources.vegetable
    const scoreBefore = session.getState().scores[0]!.total

    const response = session.takeAction(0, 'wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(familyBefore + 1)
    expect(response.state.players[0]!.resources.vegetable).toBe(vegetablesBefore + 1)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { vegetable: 1 } }),
    }))
    expect(response.scores[0]!.total).toBe(scoreBefore + 5)
  })

  it('gains exactly 1 vegetable after Family Growth without room', () => {
    const session = setup(5, 2)
    const player = session.state.players[0]!
    const familyBefore = familySize(player)
    const vegetablesBefore = player.resources.vegetable
    const scoreBefore = session.getState().scores[0]!.total

    const response = session.takeAction(0, 'urgent-wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(familyBefore + 1)
    expect(response.state.players[0]!.resources.vegetable).toBe(vegetablesBefore + 1)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { vegetable: 1 } }),
    }))
    expect(response.scores[0]!.total).toBe(scoreBefore + 5)
  })

  it('does not gain a vegetable after an unrelated action', () => {
    const session = setup(1, 2)
    const player = session.state.players[0]!
    const familyBefore = familySize(player)
    const vegetablesBefore = player.resources.vegetable
    const scoreBefore = session.getState().scores[0]!.total

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(familyBefore)
    expect(response.state.players[0]!.resources.vegetable).toBe(vegetablesBefore)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log.some((entry) =>
      entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
    )).toBe(false)
    expect(response.scores[0]!.total).toBe(scoreBefore)
  })
})
