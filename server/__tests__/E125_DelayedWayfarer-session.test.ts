import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import {
  familySize,
  inactiveWorkersInSupply,
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
  workersAtHome,
} from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E125_DelayedWayfarer'

const CARD_ID = 'E125_DelayedWayfarer'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, round = 5, playedRound = round, supply = true, ownerAtHome = 0,
}: {
  played?: boolean
  round?: number
  playedRound?: number
  supply?: boolean
  ownerAtHome?: number
} = {}) => {
  const session = new GameSession(7125, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, index === 0 && !supply ? 5 : 2)
    setWorkersAtHome(state, player, index === 0 ? ownerAtHome : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played) owner.cardStates[CARD_ID] = { extraData: { playedRound } }
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const hasWayfarerOption = (response: SessionResponse) =>
  optionsOf(response).some((option) => option.sourceCard === CARD_ID)

const playDelayedWayfarer = (session: GameSession, resource: 'wood' | 'clay' | 'reed' | 'stone') => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    const card = optionsOf(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  const resourceOption = optionsOf(response).find((option) =>
    option.sourceCard === CARD_ID
      && option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesGained?.[resource] === 1)
  expect(resourceOption, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return {
    offered: optionsOf(response).filter((option) => option.sourceCard === CARD_ID),
    response: session.resolveChoice(response.interaction.playerIndex, resourceOption!.value),
  }
}

const acceptWayfarerPlacement = (
  session: GameSession,
  initial: SessionResponse,
  targetSpaceId: string,
) => {
  let response = initial
  for (let step = 0; step < 4 && response.interaction.stateId === 'wait'; step++) {
    const options = optionsOf(response)
    const target = options.find((option) => option.value === targetSpaceId)
    const activation = options.find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
    const option = target ?? activation
    if (!option) break
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  return response
}

describe('E125 Delayed Wayfarer parity', () => {
  it('E125 S1: playing the occupation offers all four building resources and grants the chosen one', () => {
    const session = setup({ played: false, ownerAtHome: 2 })

    const { offered, response } = playDelayedWayfarer(session, 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(offered.map((option) => option.effectPreview?.kind === 'resourceExchange'
      ? option.effectPreview.resourcesGained
      : undefined)).toEqual(expect.arrayContaining([
      { wood: 1 }, { clay: 1 }, { reed: 1 }, { stone: 1 },
    ]))
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 1,
    })
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'playedRound')).toBe(5)
  })

  it('E125 S2: the extra placement is unavailable while a normal person remains', () => {
    const session = setup({ ownerAtHome: 1 })

    const response = session.performRoundEnd()

    expect(response.ok).toBe(false)
    expect(response.error).toBe('not all workers used')
    expect(hasWayfarerOption(response)).toBe(false)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(1)
  })

  it('E125 S3: after every normal person is placed, an optional supply placement is offered', () => {
    const response = setup().performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    expect(hasWayfarerOption(response)).toBe(true)
    expect(optionsOf(response).some((option) => option.value === '__skip__')).toBe(true)
  })

  it('E125 S4: accepting permanently activates a supply person before placing it', () => {
    const session = setup()
    const before = session.getState().state.players[0]!
    expect(familySize(before)).toBe(2)
    expect(inactiveWorkersInSupply(before)).toHaveLength(3)

    const response = acceptWayfarerPlacement(session, session.performRoundEnd(), 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(3)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(2)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'playedRound')).toBe(-1)
  })

  it('E125 S5: declining ends the round without consuming a supply person', () => {
    const session = setup()
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')

    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(3)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'playedRound')).toBe(-1)
  })

  it('E125 S6: no supply person means no extra-placement offer', () => {
    const session = setup({ supply: false })

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(hasWayfarerOption(response)).toBe(false)
    expect(familySize(response.state.players[0]!)).toBe(5)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(0)
  })

  it('E125 S7: the supply placement is not offered in a later round', () => {
    const session = setup({ playedRound: 4 })

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(hasWayfarerOption(response)).toBe(false)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(3)
  })
})
