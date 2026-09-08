import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { C095_BasketWeaver } from '../../shared/cards/C/C095_BasketWeaver'
import { occupations } from '../../shared/cards/_lookup'

const CARD_ID = 'C095_BasketWeaver'
const BASKET = 'Major_Basket'
const FILLER = '__test_placeholder__'

if (!occupations.some((card) => card.id === CARD_ID)) occupations.push(C095_BasketWeaver)

const setup = ({ reed = 1, stone = 1, basketAvailable = true } = {}) => {
  const session = new GameSession(5095, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
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
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID, FILLER]
  owner.resources.food = 0
  owner.resources.reed = reed
  owner.resources.stone = stone
  if (basketAvailable) {
    if (!state.availableMajorImprovements.includes(BASKET)) {
      state.availableMajorImprovements.push(BASKET)
    }
  } else {
    state.availableMajorImprovements = state.availableMajorImprovements
      .filter((id) => id !== BASKET)
  }
  session.loadState(state)
  return session
}

const playBasketWeaver = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}

const resolveBasketWeaverTrigger = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.kind).toBe('select-trigger')
  const trigger = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(trigger, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, trigger!.value)
}

const acceptBasketBuild = (session: GameSession, response: SessionResponse) => {
  response = resolveBasketWeaverTrigger(session, response)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

describe('C095 Basket Weaver parity', () => {
  it('C095 S1: with exactly one reed and one stone resolves the immediate Basket build', () => {
    const session = setup()
    const response = acceptBasketBuild(session, playBasketWeaver(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
  })

  it('C095 S2: with two reed and two stone resolves a selected Basket payment', () => {
    const session = setup({ reed: 2, stone: 2 })
    const response = acceptBasketBuild(session, playBasketWeaver(session))

    expect(response.state.players[0]!.improvements).toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
  })

  it('C095 S3: with one reed and no stone cannot pay for the immediate Basket build', () => {
    const session = setup({ reed: 1, stone: 0 })
    const response = playBasketWeaver(session)
    expect(response.interaction.request.options?.find((option) => option.value === CARD_ID)?.disabled).toBe(true)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 0 })
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.value === BASKET) ?? false
      : false).toBe(false)
  })

  it('C095 S4: when Basketmakers Workshop is unavailable the immediate build cannot be completed', () => {
    const response = playBasketWeaver(setup({ basketAvailable: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'confirm-next-player' },
    })
  })

  it('C095 S5: the immediate Basket build decline path is characterized', () => {
    const session = setup()
    let response = resolveBasketWeaverTrigger(session, playBasketWeaver(session))

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const skip = response.interaction.request.options?.find((option) => option.value === '__skip__')
    expect(skip, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, skip!.value)

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
  })
})
