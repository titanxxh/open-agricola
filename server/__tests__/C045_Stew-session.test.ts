import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C045_Stew'

const CARD_ID = 'C045_Stew'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, clay = 1, round = 5 } = {}) => {
  const session = new GameSession(5045, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.clay = clay
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
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('C045 Stew parity', () => {
  it('C045 S1: paying one clay plays Stew', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('C045 S2: lacking clay keeps Stew unavailable', () => {
    const response = enterMinor(setup({ clay: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('C045 S3: using Day Laborer schedules one food on each of the next four rounds', () => {
    const response = setup({ played: true }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(futureRounds(response)).toEqual([6, 7, 8, 9])
  })

  it('C045 S4: using a different action space schedules no Stew food', () => {
    const session = setup({ played: true })
    const state = session.getState().state
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(futureRounds(response)).toEqual([])
  })

  it('C045 S5: a round-twelve Day Laborer use schedules food only through round fourteen', () => {
    const response = setup({ played: true, round: 12 }).takeAction(0, 'day-laborer')

    expect(futureRounds(response)).toEqual([13, 14])
  })

  it('C045 S6: scheduled Stew food is received at the next round start', () => {
    const session = setup({ played: true })
    session.takeAction(0, 'day-laborer')
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(futureRounds(response)).toEqual([7, 8, 9])
  })
})
