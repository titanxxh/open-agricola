import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A008_FoodBasket'

const CARD_ID = 'A008_FoodBasket'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']
const IMPROVEMENTS = ['A041_VegetableSlicer', 'B010_Caravan']

const setup = ({
  occupations,
  improvements,
  reed,
}: {
  occupations: number
  improvements: number
  reed: number
}) => {
  const session = new GameSession(8, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.minorPlayed = IMPROVEMENTS.slice(0, improvements)
  player.resources.reed = reed
  player.resources.grain = 0
  player.resources.vegetable = 0
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

describe('A008 Food Basket parity', () => {
  it('A008 S1: prerequisites and one reed grant grain and vegetable before the card passes', () => {
    const response = playMinor(setup({ occupations: 2, improvements: 2, reed: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, grain: 1, vegetable: 1 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A008 S2: one occupation keeps Food Basket unavailable', () => {
    const session = setup({ occupations: 1, improvements: 2, reed: 1 })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A008 S3: one improvement keeps Food Basket unavailable', () => {
    const session = setup({ occupations: 2, improvements: 1, reed: 1 })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A008 S4: no reed keeps Food Basket unavailable after both prerequisites', () => {
    const session = setup({ occupations: 2, improvements: 2, reed: 0 })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, grain: 0, vegetable: 0 })
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })
})
