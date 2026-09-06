import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  inactiveWorkersInSupply,
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
  workersAtHome,
} from '../../shared/domain/player'

import '../../shared/cards/D/D022_WorkPermit'

const CARD_ID = 'D022_WorkPermit'
const FILLER = '__test_placeholder__'

const setupPurchase = ({
  round = 5, food = 1, wood = 1, clay = 0, reed = 0, stone = 0, supplyFarmer = true,
} = {}) => {
  const session = new GameSession(6022, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, index === 0 && !supplyFarmer ? 5 : 2)
    setWorkersAtHome(state, player, index === 0 ? player.workers.filter((worker) => worker.isActive).length : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: index === 0 ? wood : 0,
      clay: index === 0 ? clay : 0,
      reed: index === 0 ? reed : 0,
      stone: index === 0 ? stone : 0,
      food: index === 0 ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  state.players[0]!.minorHand = [CARD_ID, FILLER]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession): SessionResponse => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const workPermitRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID)
  .map((entry) => entry.round)
  .sort((left, right) => left - right)

const setupDue = (buildingResources: { wood?: number; clay?: number; reed?: number; stone?: number } = { wood: 1 }) => {
  const session = setupPurchase({ food: 21, wood: 0, ...buildingResources })
  const purchase = play(session)
  expect(purchase.ok, purchase.error).toBe(true)
  const state = session.getState().state
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    markAllWorkersUsed(state, player)
  })
  session.loadState(state)
  return session
}

const acceptWorkPermit = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

describe('D022 Work Permit parity', () => {
  it('D022 S1: one building resource schedules the next round and costs one food while OA keeps the supply person', () => {
    const session = setupPurchase()
    const supplyBefore = inactiveWorkersInSupply(session.state.players[0]!).length

    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
    expect(workPermitRounds(response)).toEqual([6])
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(supplyBefore)
  })

  it('D022 S2: every building resource unit contributes one round without being consumed', () => {
    const response = play(setupPurchase({ wood: 1, clay: 2, reed: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(workPermitRounds(response)).toEqual([9])
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 1, clay: 2, reed: 1, stone: 0, food: 0,
    })
  })

  it('D022 S3: without a building resource Work Permit is unavailable and pays nothing', () => {
    const response = enterMinor(setupPurchase({ wood: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(workPermitRounds(response)).toEqual([])
  })

  it('D022 S4: characterize OA allowing Work Permit with no person in supply', () => {
    const session = setupPurchase({ supplyFarmer: false })
    expect(inactiveWorkersInSupply(session.state.players[0]!)).toHaveLength(0)

    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(workPermitRounds(response)).toEqual([6])
  })

  it('D022 S5: a target after round fourteen still plays and pays but schedules no person', () => {
    const response = play(setupPurchase({ round: 13, wood: 1, clay: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(workPermitRounds(response)).toEqual([])
  })

  it('D022 S6: characterize OA using a regular person for the target-round placement', () => {
    const session = setupDue()
    let response = acceptWorkPermit(session, session.performRoundEnd())
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.map((option) => option.value)).toContain('forest')
    response = session.resolveChoice(response.interaction.playerIndex, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(1)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual(expect.objectContaining({ playerId: response.state.players[0]!.id }))
  })

  it('D022 S7: the target-round extra placement may be declined without consuming a person', () => {
    const session = setupDue()
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.sourceCard).toBe(CARD_ID)

    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(2)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .not.toContainEqual(expect.objectContaining({ playerId: response.state.players[0]!.id }))
  })

  it('D022 S8: before the target round Work Permit offers no extra placement', () => {
    const response = setupDue({ wood: 1, clay: 1 }).performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== CARD_ID).toBe(true)
    expect(workPermitRounds(response)).toEqual([7])
  })
})
