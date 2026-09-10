import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D080_BrickHammer'
import '../../shared/cards/E/E040_BeeStatue'
import '../../shared/cards/C/C122_Bricklayer'

const CARD_ID = 'D080_BrickHammer'
const BEE_STATUE = 'E040_BeeStatue'
const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, resources = {}, hand,
}: {
  played?: boolean
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
  hand?: string[]
} = {}) => {
  const session = new GameSession(6080, undefined, { playerCount: 2 })
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
  owner.minorHand = hand ?? (played ? [FILLER] : [CARD_ID])
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources = {
    ...owner.resources,
    wood: played ? 0 : 1,
    ...resources,
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

const playMinor = (session: GameSession, cardId = CARD_ID) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) =>
      option.value === cardId || option.value === `minor:${cardId}`)
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
  if (!response.state.players[0]!.improvements.includes(cardId)
    && response.interaction.stateId === 'wait') {
    expect(
      options(response).map((option) => option.value),
      JSON.stringify(response.interaction),
    ).toContain(cardId)
    response = session.resolveChoice(response.interaction.playerIndex, cardId)
  }
  return resolvePayment(session, response)
}

describe('D080 Brick Hammer parity', () => {
  it('D080 S1: paying one wood plays Brick Hammer', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D080 S2: paying one food also plays Brick Hammer', () => {
    const response = playMinor(setup({
      played: false, resources: { wood: 0, food: 1 },
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D080 S3: building a Fireplace with a printed two-clay cost gains one stone', () => {
    const response = buildMajor(setup({ resources: { clay: 2 } }), 'Major_Fireplace1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 1 })
  })

  it('D080 S4: building a major without a printed two-clay cost gains no stone', () => {
    const response = buildMajor(
      setup({ resources: { wood: 2, stone: 2 } }), 'Major_Joinery',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('D080 S5: a minor with a printed two-clay cost grants one stone', () => {
    const response = playMinor(setup({ resources: { clay: 2 }, hand: [BEE_STATUE] }), BEE_STATUE)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(BEE_STATUE)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 1 })
  })
  it('uses printed clay cost when Bricklayer reduces the payment', () => {
    const session = setup({ resources: { clay: 1 }, hand: [BEE_STATUE] })
    const state = session.getState().state
    state.players[0]!.occupationPlayed = ['C122_Bricklayer']
    session.loadState(state)
    const response = playMinor(session, BEE_STATUE)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(BEE_STATUE)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 1 })
  })

})
