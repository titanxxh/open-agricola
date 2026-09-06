import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D057_WholesaleMarket'

const CARD_ID = 'D057_WholesaleMarket'
const FILLER = '__test_placeholder__'

const setup = ({ wood = 2, vegetable = 2, round = 11 } = {}) => {
  const session = new GameSession(6057, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID, FILLER]
  player.resources.wood = wood
  player.resources.vegetable = vegetable
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

describe('D057 Wholesale Market parity', () => {
  it('D057 S1: paying two wood and two vegetables schedules one food on every remaining round', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, vegetable: 0 })
    expect(futureRounds(response)).toEqual([12, 13, 14])
  })

  it('D057 S2: missing either printed resource keeps Wholesale Market unavailable', () => {
    for (const resources of [{ wood: 1, vegetable: 2 }, { wood: 2, vegetable: 1 }]) {
      const response = enterMinor(setup(resources))
      expect(offered(response)).toBe(false)
      expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
      expect(futureRounds(response)).toEqual([])
    }
  })

  it('D057 S3: a round-thirteen play schedules food only on round fourteen', () => {
    const response = play(setup({ round: 13 }))

    expect(futureRounds(response)).toEqual([14])
  })

  it('D057 S4: scheduled Wholesale Market food is received at the next round start', () => {
    const session = setup({ round: 12 })
    play(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(13)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response)).toEqual([14])
  })
})
