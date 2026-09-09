import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D099_EarthenwarePotter'
import '../../shared/cards/A/A099_FellowGrazer'

const CARD_ID = 'D099_EarthenwarePotter'
const OTHER_OCCUPATION = 'A099_FellowGrazer'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, early = true, clay = 2, family = 2, round = 14,
} = {}) => {
  const session = new GameSession(6099, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
  })
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  setActiveWorkerCount(owner, family)
  setWorkersAtHome(state, owner, family)
  owner.resources.clay = clay
  owner.occupationHand = played ? [OTHER_OCCUPATION] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played && early) {
    owner.cardStates[CARD_ID] = { counters: { earlyBuy: 1 } }
  }
  session.loadState(state)
  return session
}

const playEarthenwarePotter = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

const startHarvest = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  const response = session.performRoundEnd()
  expect(response.ok, response.error).toBe(true)
  return response
}

const finishHarvest = startHarvest

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

describe('D099 Earthenware Potter parity', () => {
  it('D099 S1: playing Earthenware Potter in round four marks it for final-harvest scoring', () => {
    const response = playEarthenwarePotter(setup({ played: false, clay: 0, round: 4 }))

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.earlyBuy).toBe(1)
  })

  it('D099 S2: playing Earthenware Potter after round four does not mark it', () => {
    const response = playEarthenwarePotter(setup({ played: false, clay: 0, round: 5 }))

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.earlyBuy ?? 0).toBe(0)
  })

  it('D099 S3: after the final harvest one clay buys one point with two people', () => {
    const response = finishHarvest(setup({ clay: 1 }))

    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(bonusVp(response)).toBe(1)
  })

  it('D099 S4: after the final harvest clay above family size is capped at two', () => {
    const response = finishHarvest(setup({ clay: 3 }))

    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(bonusVp(response)).toBe(2)
  })

  it('D099 S5: four people can convert four clay after the final harvest', () => {
    const response = finishHarvest(setup({ clay: 5, family: 4 }))

    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(bonusVp(response)).toBe(4)
  })

  it('D099 S6: an early-played card does not convert clay after a nonfinal harvest', () => {
    const response = startHarvest(setup({ clay: 2, round: 13 }))

    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(bonusVp(response)).toBe(0)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('D099 S7: an unmarked late-played card never converts clay after the final harvest', () => {
    const response = startHarvest(setup({ early: false, clay: 2 }))

    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(bonusVp(response)).toBe(0)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('D099 S8: with no clay the final harvest adds no bonus point', () => {
    const response = startHarvest(setup({ clay: 0 }))

    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(bonusVp(response)).toBe(0)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('D099 S9: the mandatory conversion cannot be declined or scored twice', () => {
    const session = setup({ clay: 2 })
    const response = startHarvest(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(bonusVp(response)).toBe(2)
    expect(JSON.stringify(response.interaction)).not.toContain('__skip__')
    expect(bonusVp(session.getState())).toBe(2)
    expect(session.getState().state.players[0]!.resources.clay).toBe(0)
  })
})
