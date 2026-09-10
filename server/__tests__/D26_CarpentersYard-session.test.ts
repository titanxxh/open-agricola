import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D026_CarpentersYard'

const CARD_ID = 'D026_CarpentersYard'
const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, joineryOwner = -1, clay = 0,
}: { played?: boolean; joineryOwner?: number; clay?: number } = {}) => {
  const session = new GameSession(6026, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
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
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources = {
    ...owner.resources,
    wood: played ? 10 : 1, reed: played ? 10 : 1, stone: played ? 10 : 0, clay,
  }
  if (joineryOwner >= 0) {
    state.players[joineryOwner]!.improvements.push('Major_Joinery')
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (cardId) => cardId !== 'Major_Joinery',
    )
  }
  session.loadState(state)
  return session
}

const resolvePayment = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait'
    || response.interaction.promptKey !== 'prompt.selectPayment') return response
  const payment = options(response).find((option) => option.value !== 'cancel')
  expect(payment, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, payment!.value)
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
    response = resolvePayment(session, response)
  }
  return response
}

const buildMajor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    expect(options(response).map((option) => option.value)).toContain(cardId)
    response = session.resolveChoice(response.interaction.playerIndex, cardId)
  }
  return resolvePayment(session, response)
}

describe("D026 Carpenter's Yard parity", () => {
  it("D026 S1: paying one wood and one reed plays Carpenter's Yard", () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it.each(['Major_Well', 'Major_Joinery'])('a minor action buys only %s', (cardId) => {
    const session = setup()
    let response = session.takeAction(0, 'meeting-place')
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(0, branch.value)
    expect(options(response).map((option) => option.value)).toContain(cardId)
    response = resolvePayment(session, session.resolveChoice(0, cardId))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toEqual([cardId])
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it.each(['Major_Well', 'Major_Joinery'])('a major action buys %s and optionally the other', (first) => {
    const session = setup()
    let response = buildMajor(session, first)
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = resolvePayment(session, session.resolveChoice(0, accept!.value))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements.sort()).toEqual(['Major_Joinery', 'Major_Well'])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 7, stone: 5 })
  })

  it('can decline the second improvement without paying for it', () => {
    const session = setup()
    let response = buildMajor(session, 'Major_Well')
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toEqual(['Major_Well'])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 9, stone: 7 })
  })

  it('D026 S5: building an unrelated major improvement offers no second build', () => {
    const response = buildMajor(setup({ clay: 2 }), 'Major_Fireplace1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('D026 S6: OA offers no unusable second build when the other major is unavailable', () => {
    const session = setup({ joineryOwner: 1 })
    const response = buildMajor(session, 'Major_Well')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Well')
    expect(response.state.players[1]!.improvements).toContain('Major_Joinery')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })
})
