import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A123_FrameBuilder'
import '../../shared/cards/B/B109_PaperMaker'

const CARD_ID = 'B109_PaperMaker'
const TARGET = 'A123_FrameBuilder'
const PRIOR = 'B121_Geologist'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, occupations = 1, food = 0, wood = 1, playerCount = 4,
} = {}) => {
  const session = new GameSession(5109, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.occupationPlayed = played
    ? [CARD_ID, ...(occupations >= 2 ? [PRIOR] : [])]
    : []
  owner.occupationHand = [played ? TARGET : CARD_ID]
  owner.resources = {
    ...owner.resources, wood, food, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
  }
  session.loadState(state)
  return session
}

const paidResources = (option: ActionChoiceOption) =>
  (option.labelParams as { resourcesPaid?: Record<string, number> } | undefined)?.resourcesPaid ?? {}

const playOccupation = (
  session: GameSession, actionId: 'lessons' | 'lessons-4', cardId: string, payWith?: 'wood' | 'food',
) => {
  let response = session.takeAction(0, actionId)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.options?.some((option) => option.value === cardId)) {
    response = session.resolveChoice(response.interaction.playerIndex, cardId)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = response.interaction.request.options?.find((option) =>
      payWith ? (paidResources(option)[payWith] ?? 0) === 1 : option.value !== 'cancel')
    expect(payment, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
  }
  return response
}

describe('B109 Paper Maker parity', () => {
  it('B109 S1: playing Paper Maker itself as the first occupation spends no wood and gains no food', () => {
    const response = playOccupation(setup({ played: false }), 'lessons', CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('B109 S2: before the next occupation one wood can fund its one-food Lessons cost', () => {
    const session = setup()
    const response = playOccupation(session, 'lessons', TARGET, 'wood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid', paymentFor: 'occupation',
        resources: expect.objectContaining({ wood: 1 }),
      }),
    ]))
  })

  it('B109 S3: with two occupations in play one wood funds a two-food Lessons cost', () => {
    const session = setup({ occupations: 2 })
    const response = playOccupation(session, 'lessons-4', TARGET, 'wood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })

  it('B109 S4: declining Paper Maker pays the normal Lessons food and preserves wood', () => {
    const session = setup({ food: 1 })
    const response = playOccupation(session, 'lessons', TARGET, 'food')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })
})
