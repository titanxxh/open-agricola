import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E046_WaterlilyPond'

const CARD_ID = 'E046_WaterlilyPond'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A100_Curator', 'A106_SlurrySpreader', 'A167_BreederBuyer']

const setup = ({ occupations = 2, round = 5, food = 0 } = {}) => {
  const session = new GameSession(7046, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID, FILLER]
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('E046 Waterlily Pond parity', () => {
  it('E046 S1: exactly two occupations allow Waterlily Pond and schedule one food for each of the next two rounds', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(futureRounds(response)).toEqual([6, 7])
  })

  it('E046 S2: one occupation keeps Waterlily Pond unavailable', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(futureRounds(response)).toEqual([])
  })

  it('E046 S3: three occupations also keep Waterlily Pond unavailable', () => {
    const response = enterMinor(setup({ occupations: 3 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(futureRounds(response)).toEqual([])
  })

  it('E046 S4: a round-thirteen play schedules food only for round fourteen', () => {
    const response = play(setup({ round: 13 }))

    expect(futureRounds(response)).toEqual([14])
  })

  it('E046 S5: a round-fourteen play succeeds but schedules no future food', () => {
    const response = play(setup({ round: 14 }))

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(futureRounds(response)).toEqual([])
  })

  it('E046 S6: scheduled Waterlily Pond food is received at the next round start', () => {
    const session = setup({ food: 20 })
    play(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response)).toEqual([7])
  })

  it('E046 S7: Waterlily Pond contributes its printed one point at scoring', () => {
    const response = play(setup())
    const cardEntry = response.scores?.[0]?.categories
      .find((category) => category.key === 'cards')?.entries
      .find((entry) => entry.cardId === CARD_ID)

    expect(cardEntry?.score).toBe(1)
  })
})
