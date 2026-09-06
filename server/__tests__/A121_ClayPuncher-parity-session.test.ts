import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A121_ClayPuncher'
import '../../shared/cards/A/A099_FellowGrazer'

const CARD_ID = 'A121_ClayPuncher'
const OTHER_OCCUPATION = 'A099_FellowGrazer'
const FILLER = '__test_placeholder__'

const setup = ({
  playerCount = 2,
  actor = 0,
  played = true,
  food = 1,
} = {}) => {
  const session = new GameSession(5121, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.clay = 0
    player.resources.food = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [OTHER_OCCUPATION] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, spaceId: string, cardId: string) => {
  const response = session.takeAction(0, spaceId)
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('A121 Clay Puncher parity', () => {
  it('A121 S1: playing Clay Puncher through Lessons gains clay once for play and once for Lessons', () => {
    const response = playOccupation(setup({ played: false, food: 0 }), 'lessons', CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('A121 S2: using the regular Lessons space after Clay Puncher gains one clay', () => {
    const response = playOccupation(setup(), 'lessons', OTHER_OCCUPATION)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OTHER_OCCUPATION)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 1 })
  })

  it('A121 S3: the four-player Lessons space also gains one clay', () => {
    const response = playOccupation(setup({ playerCount: 4 }), 'lessons-4', OTHER_OCCUPATION)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OTHER_OCCUPATION)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 1 })
  })

  it('A121 S4: Clay Pit grants its accumulated clay plus one Clay Puncher clay', () => {
    const session = setup()
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(3)
  })

  it('A121 S5: a non-Lessons non-Clay-Pit space grants no Clay Puncher clay', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it("A121 S6: an opponent using Clay Pit does not trigger the owner's Clay Puncher", () => {
    const session = setup({ actor: 1 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(1, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[1]!.resources.clay).toBe(2)
  })
})
