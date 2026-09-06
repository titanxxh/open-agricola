import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A031_DebtSecurity'
import '../../shared/cards/D/D021_Recruitment'

const CARD_ID = 'D021_Recruitment'
const NORMAL_MINOR_ID = 'A031_DebtSecurity'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, round = 5, rooms = 3, food = 0, normalMinor = false, workersAtHome = 2,
} = {}) => {
  const session = new GameSession(6021, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? workersAtHome : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.rooms = rooms
  player.resources.food = food
  player.minorHand = [
    ...(played ? [] : [CARD_ID]),
    ...(normalMinor ? [NORMAL_MINOR_ID] : []),
    FILLER,
  ]
  if (played) player.minorPlayed = [CARD_ID]
  for (const id of ['meeting-place', 'major-improvement']) {
    state.actionSpaces.find((space) => space.id === id)!.takenBy = []
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMeetingPlaceMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-')
      || option.labelKey === 'ui.interactionActionOrReplace')
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playRecruitment = (session: GameSession) => {
  let response = enterMeetingPlaceMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const recruitmentOption = (response: SessionResponse) => options(response)
  .find((option) => option.sourceCard === CARD_ID)

describe('D021 Recruitment parity', () => {
  it('D021 S1: after the last person leaves home Recruitment costs one food to play', () => {
    const response = playRecruitment(setup({
      played: false, rooms: 2, food: 1, workersAtHome: 1,
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D021 S2: with a person remaining at home Recruitment is not offered', () => {
    const response = enterMeetingPlaceMinor(setup({
      played: false, rooms: 2, food: 1, workersAtHome: 2,
    }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('D021 S3: from round five a Meeting Place minor action can become room-limited family growth', () => {
    const session = setup()
    const before = session.getState().state.players[0]!.workers.filter((worker) => worker.isActive).length
    let response = enterMeetingPlaceMinor(session)
    const replacement = recruitmentOption(response)
    expect(replacement).toBeDefined()

    response = session.resolveChoice(response.interaction.playerIndex, replacement!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(before + 1)
  })

  it('D021 S4: Recruitment keeps an otherwise unusable Improvements space available for family growth', () => {
    const session = setup()
    const before = session.getState().state.players[0]!.workers.filter((worker) => worker.isActive).length

    let response = session.takeAction(0, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    const replacement = recruitmentOption(response)
    expect(replacement).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, replacement!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(before + 1)
  })

  it('D021 S5: the Recruitment replacement may be declined to play the normal minor improvement', () => {
    const session = setup({ food: 2, normalMinor: true })
    const before = session.getState().state.players[0]!.workers.filter((worker) => worker.isActive).length
    let response = enterMeetingPlaceMinor(session)
    const normal = options(response).find((option) => option.sourceCard !== CARD_ID)
    expect(normal).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, normal!.value)
    if (response.interaction.stateId === 'wait') {
      const card = options(response).find((option) => option.value === NORMAL_MINOR_ID)
      expect(card).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(NORMAL_MINOR_ID)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(before)
  })

  it('D021 S6: before round five Recruitment offers no replacement', () => {
    const response = enterMeetingPlaceMinor(setup({ round: 4, food: 2, normalMinor: true }))

    expect(recruitmentOption(response)).toBeUndefined()
    expect(response.state.players[0]!.minorPlayed).toContain(NORMAL_MINOR_ID)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
  })

  it('D021 S7: without a free room Recruitment offers no replacement', () => {
    const response = enterMeetingPlaceMinor(setup({ rooms: 2, food: 2, normalMinor: true }))

    expect(recruitmentOption(response)).toBeUndefined()
    expect(response.state.players[0]!.minorPlayed).toContain(NORMAL_MINOR_ID)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
  })
})
