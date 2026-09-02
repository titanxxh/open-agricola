import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A103_Portmonger'

const CARD_ID = 'A103_Portmonger'

const purchaseSession = () => {
  const session = new GameSession(103, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  setWorkersAtHome(state, state.players[0]!, 2)
  state.players[0]!.occupationHand = [CARD_ID]
  state.players[0]!.resources.food = 0
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const actionSession = (fishingFood: number) => {
  const session = new GameSession(103, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  setWorkersAtHome(state, state.players[0]!, 2)
  state.players[0]!.occupationPlayed = [CARD_ID]
  state.players[0]!.resources = {
    ...state.players[0]!.resources,
    food: 0,
    vegetable: 0,
    grain: 0,
    reed: 0,
  }
  state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = fishingFood
  session.loadState(state)
  return session
}

describe('A103 Portmonger parity', () => {
  it('A103 S1: playing Portmonger through Lessons keeps the occupation in play', () => {
    const response = playOccupation(purchaseSession())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.occupationHand).not.toContain(CARD_ID)
  })

  it.each([
    { id: 'S2', food: 1, gain: { vegetable: 1, grain: 0, reed: 0 } },
    { id: 'S3', food: 2, gain: { vegetable: 0, grain: 1, reed: 0 } },
    { id: 'S4', food: 4, gain: { vegetable: 0, grain: 0, reed: 1 } },
  ])('A103 $id: maps $food Fishing food to the matching bonus', ({ food, gain }) => {
    const session = actionSession(food)

    const response = session.takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food, ...gain })
  })

  it('A103 S5: food from Day Laborer is not an accumulation-space collection', () => {
    const session = actionSession(3)

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2,
      vegetable: 0,
      grain: 0,
      reed: 0,
    })
  })
})
