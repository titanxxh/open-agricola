import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B125_EstateWorker'

const CARD_ID = 'B125_EstateWorker'
const FILLER = '__test_placeholder__'

const setup = (round = 5) => {
  const session = new GameSession(5325, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  state.players[0]!.occupationHand = [CARD_ID]
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return response
}

const futureRounds = (response: SessionResponse, resource: keyof Resource) =>
  response.state.futureMeeples
    .filter((entry) => entry.cardId === CARD_ID && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

const prepareRoundEnd = (state: GameState) => {
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
}

describe('B125 Estate Worker parity', () => {
  it('B125 S1: playing Estate Worker schedules wood, clay, reed, and stone on the next four rounds', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(futureRounds(response, 'wood')).toEqual([6])
    expect(futureRounds(response, 'clay')).toEqual([7])
    expect(futureRounds(response, 'reed')).toEqual([8])
    expect(futureRounds(response, 'stone')).toEqual([9])
  })

  it('B125 S2: a round-twelve play schedules only reachable wood and clay', () => {
    const response = play(setup(12))

    expect(futureRounds(response, 'wood')).toEqual([13])
    expect(futureRounds(response, 'clay')).toEqual([14])
    expect(futureRounds(response, 'reed')).toEqual([])
    expect(futureRounds(response, 'stone')).toEqual([])
  })

  it('B125 S3: Estate Worker wood is received at the next round start', () => {
    const session = setup()
    play(session)
    const state = session.getState().state
    prepareRoundEnd(state)
    const woodBefore = state.players[0]!.resources.wood
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore + 1)
    expect(futureRounds(response, 'wood')).toEqual([])
    expect(futureRounds(response, 'clay')).toEqual([7])
  })
})
