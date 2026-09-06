import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C079_StoneCart'

const CARD_ID = 'C079_StoneCart'
const FILLER = '__test_placeholder__'

const setup = ({ wood = 2, occupations = 2, round = 5 } = {}) => {
  const session = new GameSession(5079, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `STUB_OCC_${index}`)
  player.resources = {
    ...player.resources, wood, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
  }
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.stone ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.stone ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('C079 Stone Cart parity', () => {
  it('C079 S1: two occupations and two wood play Stone Cart and schedule stone on remaining even rounds', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response)).toEqual([6, 8, 10, 12, 14])
  })

  it('C079 S2: one occupation keeps Stone Cart unavailable without spending wood', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(futureRounds(response)).toEqual([])
  })

  it('C079 S3: a round-eleven play schedules stone only on rounds twelve and fourteen', () => {
    const response = play(setup({ round: 11 }))

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response)).toEqual([12, 14])
  })

  it('C079 S4: scheduled Stone Cart stone is received at the next even round start', () => {
    const session = setup()
    play(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(futureRounds(response)).toEqual([8, 10, 12, 14])
  })
})
