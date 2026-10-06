import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { expectPublicCardGoods } from './_helpers/card-public-presentation'

import '../../shared/cards/C/C103_GreenGrocer'
import '../../shared/cards/C/C120_AgriculturalLabourer'

const CARD_ID = 'C120_AgriculturalLabourer'
const EXCHANGE_ID = 'C103_GreenGrocer'
const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, clayOnCard = played ? 8 : 0, food = 0, round = 4, fields = 0, actor = 0,
}: {
  played?: boolean
  clayOnCard?: number
  food?: number
  round?: number
  fields?: number
  actor?: number
} = {}) => {
  const session = new GameSession(6120, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played) owner.cardStates[CARD_ID] = { counters: { clay: clayOnCard } }
  owner.fields = Array.from({ length: fields }, (_, index) => ({
    row: 0, col: 2 + index, stacks: [{ kind: 'grain' as const, remaining: 1 }],
  }))
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  return response
}

const storedClay = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.clay ?? 0

describe('C120 Agricultural Labourer parity', () => {
  it('C120 S1: playing Agricultural Labourer initializes its clay supply', () => {
    const session = setup({ played: false })
    let response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(storedClay(response)).toBe(8)
    expectPublicCardGoods(session, CARD_ID, { counters: { clay: 8 } })
    if (response.interaction.request.kind === 'confirm-next-player') session.resolveChoice(0, 'confirm')
    response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(storedClay(response)).toBe(7)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 1 })
    expectPublicCardGoods(session, CARD_ID, { counters: { clay: 7 } })
  })

  it('C120 S2: the owner gains one clay when obtaining grain from Grain Seeds', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 1 })
    expect(storedClay(response)).toBe(7)
  })

  it('C120 S3: an opponent obtaining grain does not move the owners clay', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(storedClay(response)).toBe(8)
  })

  it('C120 S4: reaping two grain fields moves two clay from the card', () => {
    const session = setup({ food: 4, fields: 2 })
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, clay: 2 })
    expect(storedClay(response)).toBe(6)
  })

  it('C120 S5: the clay reward is capped by the clay remaining on the card', () => {
    const session = setup({ clayOnCard: 1, food: 4, fields: 2 })
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, clay: 1 })
    expect(storedClay(response)).toBe(0)
    expectPublicCardGoods(session, CARD_ID, { counters: {} })
  })

  it('C120 S6: grain obtained through an exchange also moves one clay from the card', () => {
    const session = setup({ food: 6, round: 1 })
    const state = session.getState().state
    const owner = state.players[0]!
    owner.occupationPlayed.push(EXCHANGE_ID)
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    let response = resolveTriggerIfPresent(session, session.performRoundEnd(), EXCHANGE_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const exchange = options(response).find((option) =>
      option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesPaid?.food === 2
      && option.effectPreview.resourcesGained?.grain === 1)
    expect(exchange, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, exchange!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, grain: 1, clay: 1 })
    expect(storedClay(response)).toBe(7)
  })
})
