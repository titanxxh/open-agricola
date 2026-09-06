import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A057_MilkingParlor'
import '../../shared/cards/D/D074_RoyalWood'

const CARD_ID = 'D074_RoyalWood'
const TWO_WOOD_MINOR = 'A057_MilkingParlor'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({
  played = true, wood = 0, reed = 0, stone = 0, food = 0, minorId,
}: {
  played?: boolean
  wood?: number
  reed?: number
  stone?: number
  food?: number
  minorId?: string
} = {}) => {
  const session = new GameSession(6074, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
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
  player.resources = { ...player.resources, wood, reed, stone, food }
  player.minorHand = [
    ...(played ? [] : [CARD_ID]),
    ...(minorId ? [minorId] : []),
    FILLER,
  ]
  if (played) player.minorPlayed = [CARD_ID]
  for (const id of ['meeting-place', 'major-improvement', 'farm-expansion', 'fencing']) {
    state.actionSpaces.find((space) => space.id === id)!.takenBy = []
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-')
      || option.labelKey === 'ui.interactionActionOrReplace')
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = enterMinorChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === cardId)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const chooseFarmExpansionMode = (session: GameSession, labelKey: string) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId !== 'wait') return response
  const mode = options(response).find((option) => option.labelKey === labelKey)
  if (mode) response = session.resolveChoice(response.interaction.playerIndex, mode.value)
  return response
}

const finishRoyalTrigger = (session: GameSession, response: SessionResponse) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

describe('D074 Royal Wood parity', () => {
  it('D074 S1: paying one food plays Royal Wood', () => {
    const response = playMinor(setup({ played: false, food: 1 }), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D074 S2: without one food Royal Wood is unavailable and pays nothing', () => {
    const response = enterMinorChoice(setup({ played: false }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D074 S3: two wood paid for a major improvement returns one wood at turn end', () => {
    const session = setup({ wood: 2, stone: 2 })
    const state = session.getState().state
    state.availableMajorImprovements = ['Major_Joinery']
    session.loadState(state)

    let response = session.takeAction(0, 'major-improvement')
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(response.interaction.playerIndex, 'Major_Joinery')
    response = finishRoyalTrigger(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S4: two wood paid for a minor improvement returns one wood at turn end', () => {
    const session = setup({ wood: 2, minorId: TWO_WOOD_MINOR })
    let response = playMinor(session, TWO_WOOD_MINOR)
    response = finishRoyalTrigger(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(TWO_WOOD_MINOR)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S5: five wood paid for a Farm Expansion room returns two wood at turn end', () => {
    const session = setup({ wood: 5, reed: 2 })
    let response = chooseFarmExpansionMode(session, 'actions.construct.name')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.farmType).toBe('room')
    if (response.interaction.request.farm.farmType !== 'room') return

    const room = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { rooms: [room] })
    response = finishRoyalTrigger(session, response)
    const done = options(response).find((option) => option.value === '__done__')
    if (done) response = session.resolveChoice(response.interaction.playerIndex, done.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, reed: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S6: two wood paid for a Farm Expansion stable returns one wood at turn end', () => {
    const session = setup({ wood: 2 })
    let response = chooseFarmExpansionMode(session, 'actions.stables.name')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.farmType).toBe('stable')
    if (response.interaction.request.farm.farmType !== 'stable') return

    const stable = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { stables: [stable] })
    response = finishRoyalTrigger(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([stable])
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S7: room and stable wood payments in one turn are combined then rounded down', () => {
    const session = setup({ wood: 7, reed: 2 })
    let response = chooseFarmExpansionMode(session, 'actions.construct.name')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.farmType).toBe('room')
    if (response.interaction.request.farm.farmType !== 'room') return

    const room = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { rooms: [room] })
    response = finishRoyalTrigger(session, response)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent).toBe(5)

    const stableMode = options(response).find((option) => option.labelKey === 'actions.stables.name')
    expect(stableMode).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, stableMode!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.farmType).toBe('stable')
    if (response.interaction.request.farm.farmType !== 'stable') return

    const stable = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { stables: [stable] })
    response = finishRoyalTrigger(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, reed: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })

  it('D074 S8: wood paid for fencing outside Farm Expansion receives no refund', () => {
    const session = setup({ wood: 4 })
    let response = session.takeAction(0, 'fencing')
    expect(response.interaction.stateId).toBe('wait')
    response = session.commitSelectionChoice(0, {
      edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.woodSpent ?? 0).toBe(0)
  })
})
