import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A076_Cob'

const CARD_ID = 'A076_Cob'
const FILLER = '__test_placeholder__'

const setup = ({ clay = 0, grain = 0, food = 0, played = true } = {}) => {
  const session = new GameSession(5076, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = { ...player.resources, clay, grain, food }
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playCob = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const roundStart = (session: GameSession): SessionResponse => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  let response = session.performRoundEnd()
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  return response
}

describe('A076 Cob parity', () => {
  it('A076 S1: Cob costs one food to play', () => {
    const response = playCob(setup({ food: 1, played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A076 S2: at work phase start Cob may exchange exactly one grain for two clay and one food', () => {
    const session = setup({ clay: 1, grain: 2, food: 20 })
    let response = roundStart(session)
    response = resolveNonSkipChoice(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 3, food: 21 })
  })

  it('A076 S3: the Cob exchange can be declined', () => {
    const session = setup({ clay: 1, grain: 1, food: 20 })
    let response = roundStart(session)
    response = resolveSkipChoice(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 1, food: 20 })
  })

  it.each([
    ['S4', 0, 1],
    ['S5', 1, 0],
  ])('A076 %s: Cob is not offered with %i clay and %i grain', (_scenario, clay, grain) => {
    const response = roundStart(setup({ clay, grain, food: 20 }))

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay, grain, food: 20 })
  })
})
