import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { D095_SiteManager } from '../../shared/cards/D/D095_SiteManager'
import '../../shared/cards/A/A085_Homekeeper'
import { occupations } from '../../shared/cards/_lookup'

const CARD_ID = 'D095_SiteManager'
const OTHER_OCCUPATION = 'A085_Homekeeper'
const FILLER = '__test_placeholder__'

if (!occupations.some((card) => card.id === CARD_ID)) occupations.push(D095_SiteManager)

type BuildingResources = {
  wood?: number
  clay?: number
  reed?: number
  stone?: number
  food?: number
}

const setup = (
  resources: BuildingResources = {},
  majorIds = ['Major_Fireplace1'],
) => {
  const session = new GameSession(6095, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
  })
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID, OTHER_OCCUPATION]
  owner.resources = { ...owner.resources, ...resources }
  state.availableMajorImprovements = [...majorIds]
  session.loadState(state)
  return session
}

const playSiteManager = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger') {
    const trigger = response.interaction.request.options.find((candidate) => candidate.value === CARD_ID)
    expect(trigger, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, trigger!.value)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

const enterImmediateMajorChoice = (session: GameSession, start: SessionResponse, majorId: string) => {
  let response = start
  for (let depth = 0; depth < 4; depth += 1) {
    if (response.state.players[0]!.improvements.includes(majorId)) return response
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.promptKey === 'prompt.selectPayment') return response
    if (response.interaction.request.options?.some((option) => option.value === majorId)) return response
    const enter = response.interaction.request.options?.find((option) =>
      option.value !== '__skip__' && option.value !== 'cancel')
    expect(enter, JSON.stringify(response.interaction)).toBeDefined()
    if (!enter) return response
    response = session.resolveChoice(response.interaction.playerIndex, enter.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const selectMajor = (session: GameSession, start: SessionResponse, majorId: string) => {
  const response = enterImmediateMajorChoice(session, start, majorId)
  if (response.state.players[0]!.improvements.includes(majorId)) return response
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'prompt.selectPayment') return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const major = response.interaction.request.options?.find((option) => option.value === majorId)
  expect(major, JSON.stringify(response.interaction)).toBeDefined()
  const selected = session.resolveChoice(response.interaction.playerIndex, major!.value)
  expect(selected.ok, selected.error).toBe(true)
  return selected
}

const choosePayment = (
  session: GameSession,
  start: SessionResponse,
  paid: Required<BuildingResources>,
) => {
  expect(start.interaction).toMatchObject({ stateId: 'wait', promptKey: 'prompt.selectPayment' })
  if (start.interaction.stateId !== 'wait') return start
  const payment = start.interaction.request.options?.find((option) => {
    const resources = option.labelParams?.resourcesPaid as BuildingResources | undefined
    return resources?.wood === paid.wood
      && resources?.clay === paid.clay
      && resources?.reed === paid.reed
      && resources?.stone === paid.stone
      && resources?.food === paid.food
  })
  expect(payment, JSON.stringify(start.interaction)).toBeDefined()
  const response = session.resolveChoice(start.interaction.playerIndex, payment!.value)
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('D095 Site Manager parity', () => {
  it('D095 S1: playing Site Manager immediately offers an optional major improvement', () => {
    const response = playSiteManager(setup({ clay: 2 }))

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    expect(JSON.stringify(response.interaction)).toContain(CARD_ID)
  })

  it('D095 S2: the immediate major improvement can be declined', () => {
    const session = setup({ clay: 2 })
    const offered = playSiteManager(session)
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('D095 S3: one food replaces one clay in the immediate Fireplace cost', () => {
    const session = setup({ clay: 1, food: 1 })
    const response = selectMajor(session, playSiteManager(session), 'Major_Fireplace1')

    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })
  })

  it('D095 S4: the printed major-improvement cost remains selectable', () => {
    const session = setup({ clay: 2, food: 1 })
    let response = selectMajor(session, playSiteManager(session), 'Major_Fireplace1')
    response = choosePayment(session, response, { wood: 0, clay: 2, reed: 0, stone: 0, food: 0 })

    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 1 })
  })

  it('D095 S5: one food per building-resource type can replace both wood and stone', () => {
    const session = setup(
      { wood: 1, stone: 1, food: 2 }, ['Major_Fireplace1', 'Major_Joinery'],
    )
    const response = selectMajor(session, playSiteManager(session), 'Major_Joinery')

    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0, food: 0 })
  })

  it('D095 S6: with all resources available the player can replace only wood', () => {
    const session = setup(
      { wood: 2, stone: 2, food: 2 }, ['Major_Fireplace1', 'Major_Joinery'],
    )
    let response = selectMajor(session, playSiteManager(session), 'Major_Joinery')
    response = choosePayment(session, response, { wood: 1, clay: 0, reed: 0, stone: 2, food: 1 })

    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 0, food: 1 })
  })

  it('D095 S7: two food cannot replace two clay of the same type', () => {
    const response = playSiteManager(setup({ clay: 0, food: 2 }))

    expect(response.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
    expect(JSON.stringify(response.interaction)).not.toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 2 })
  })

  it('D095 S8: the replacement expires after the immediate improvement window', () => {
    const session = setup({ clay: 1, food: 1 })
    const state = session.getState().state
    const owner = state.players[0]!
    owner.occupationHand = [OTHER_OCCUPATION]
    owner.occupationPlayed = [CARD_ID]
    state.round = 14
    session.loadState(state)

    const response = session.takeAction(0, 'major-improvement')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(JSON.stringify(response.interaction)).not.toContain('Major_Fireplace1')
    expect(response.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 1 })
  })
})
