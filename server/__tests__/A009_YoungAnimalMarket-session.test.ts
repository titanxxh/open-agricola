import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A009_YoungAnimalMarket'

const CARD_ID = 'A009_YoungAnimalMarket'

const setup = (sheep: number) => {
  const session = new GameSession(9, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.sheep = sheep
  player.resources.cattle = 0
  player.houseAnimalType = null
  player.houseAnimalCount = 0
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options?.find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A009 Young Animal Market parity', () => {
  it('A009 S1: one sheep becomes one housed cattle and the card passes', () => {
    const session = setup(1)
    let response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, cattle: 1 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })

    response = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'house', zoneType: 'house', animalType: 'cattle', animalCount: 1 }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseAnimalType: 'cattle', houseAnimalCount: 1 })
  })

  it('A009 S2: no sheep keeps Young Animal Market unavailable and preserves state', () => {
    const session = setup(0)
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, cattle: 0 })
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })
})
