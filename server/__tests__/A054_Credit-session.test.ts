import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/A/A054_Credit'

const CARD_ID = 'A054_Credit'

const purchaseSession = ({ occupations, food }: { occupations: number; food: number }) => {
  const session = new GameSession(54, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `occupation-${index}`)
  player.resources.food = food
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

const roundEndSession = ({ round, food }: { round: number; food: number }) => {
  const session = new GameSession(54, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players[0]!.minorPlayed = [CARD_ID]
  state.players[0]!.resources.food = food
  state.players[0]!.resources.begging = 0
  state.players[1]!.resources.food = 8
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session
}

describe('A054 Credit parity', () => {
  it('A054 S1: at most three occupations allows Credit and grants five food', () => {
    const response = playMinor(purchaseSession({ occupations: 3, food: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(5)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A054 S2: four occupations keeps Credit unavailable', () => {
    const session = purchaseSession({ occupations: 4, food: 0 })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A054 S3: a non-harvest round end can repay one food', () => {
    const session = roundEndSession({ round: 1, food: 1 })
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.sourceCard).toBe(CARD_ID)
    const payment = response.interaction.request.options?.find((option) =>
      option.value !== '__skip__' && option.value !== 'skip'
    )
    expect(payment).toBeDefined()

    response = session.resolveChoice(0, payment!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
  })

  it('A054 S4: a non-harvest round end without food takes one begging marker', () => {
    const session = roundEndSession({ round: 1, food: 0 })
    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 1 })
  })

  it('A054 S5: a harvest round end does not repay Credit', () => {
    const session = roundEndSession({ round: 4, food: 8 })

    const response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, begging: 0 })
  })
})
