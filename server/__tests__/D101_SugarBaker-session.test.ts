import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D101_SugarBaker'

const CARD_ID = 'D101_SugarBaker'
const FIREPLACE = 'Major_Fireplace1'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, food = 0, grain = 0, field = false, fireplace = false,
} = {}) => {
  const session = new GameSession(6101, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.grain = grain
  if (field) owner.fields = [{ row: 0, col: 0, stacks: [] }]
  if (fireplace) {
    owner.improvements = [FIREPLACE]
    state.availableMajorImprovements = state.availableMajorImprovements
      .filter((id) => id !== FIREPLACE)
  }
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food = 0
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const completeSow = (session: GameSession) => {
  let response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    const sow = options(response).find((option) =>
      option.value === 'sow' || option.labelKey === 'actions.sow.name')
    if (sow) response = session.resolveChoice(response.interaction.playerIndex, sow.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
  })
  return session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
}

const completeBake = (session: GameSession) => {
  let response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    const bake = options(response).find((option) =>
      option.value === 'bake-bread' || option.labelKey === 'actions.bake-bread.name')
    if (bake) response = session.resolveChoice(response.interaction.playerIndex, bake.value)
  }
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
    expect(options(response).map((option) => option.value)).toContain(FIREPLACE)
    response = session.resolveChoice(response.interaction.playerIndex, FIREPLACE)
  }
  expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 3 })
  return response
}

const sugarBakerOption = (response: SessionResponse) => options(response).find((option) =>
  option.sourceCard === CARD_ID && option.value !== '__skip__' && !option.disabled)

const acceptSugarBaker = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  const accept = sugarBakerOption(response)
  expect(accept, JSON.stringify(response.interaction)).toBeDefined()
  const resolved = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  expect(resolved.ok, resolved.error).toBe(true)
  return resolved
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

describe('D101 Sugar Baker parity', () => {
  it('D101 S1: Sugar Baker can be played as the first occupation', () => {
    const session = setup({ played: false })
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      const card = options(response).find((option) => option.value === CARD_ID)
      expect(card, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(bonusVp(response)).toBe(0)
  })

  it('D101 S2: after sowing, one food buys one bonus point and is placed on Grain Utilization', () => {
    const session = setup({ food: 1, grain: 1, field: true })

    const response = acceptSugarBaker(session, completeSow(session))

    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(bonusVp(response)).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food)
      .toBe(1)
  })

  it('D101 S3: the Sugar Baker purchase can be declined after sowing', () => {
    const session = setup({ food: 1, grain: 1, field: true })
    let response = completeSow(session)
    expect(sugarBakerOption(response)).toBeDefined()

    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(bonusVp(response)).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food)
      .toBe(0)
  })

  it('D101 S4: without food no Sugar Baker purchase is offered after sowing', () => {
    const response = completeSow(setup({ grain: 1, field: true }))

    expect(sugarBakerOption(response)).toBeUndefined()
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food)
      .toBe(0)
  })

  it('D101 S5: after baking, the Sugar Baker purchase is still offered', () => {
    const session = setup({ food: 1, grain: 1, fireplace: true })

    const response = acceptSugarBaker(session, completeBake(session))

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(bonusVp(response)).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food)
      .toBe(1)
  })

  it('D101 S6: an unrelated action space offers no purchase and grants no point', () => {
    const response = setup({ food: 1 }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(bonusVp(response)).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food)
      .toBe(0)
  })
})
