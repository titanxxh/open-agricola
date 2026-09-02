import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B130_FullPeasant'

const CARD_ID = 'B130_FullPeasant'
const FENCE_EDGES = ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5']

const setup = ({ inHand = false, food = 3, fencingOccupied = false } = {}) => {
  const session = new GameSession(130, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.players.forEach((player) => setWorkersAtHome(state, player, 2))
  const owner = state.players[0]!
  owner.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  owner.occupationPlayed = inHand ? [] : [CARD_ID]
  owner.resources = { ...owner.resources, food, grain: 1, wood: 4 }
  owner.fields = [{ row: 0, col: 2, stacks: [] }]
  if (fencingOccupied) {
    const opponent = state.players[1]!
    state.actionSpaces.find((space) => space.id === 'fencing')!.takenBy = [{
      playerId: opponent.id,
      workerId: opponent.workers[0]!.id,
    }]
  }
  session.loadState(state)
  return session
}

const chooseSow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.farm.farmType === 'sow') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.labelParams?.actionNameKey === 'actions.sow.name'
  })
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const completeGrainUtilization = (session: GameSession) => {
  let response = chooseSow(session, session.takeAction(0, 'grain-utilization'))
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.farm.farmType !== 'sow') {
    return response
  }
  const field = response.interaction.request.farm.selectableFields[0]!.tile
  response = session.commitSelectionChoice(0, { crops: [{ ...field, crop: 'grain' }] })
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

const acceptJump = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('B130 Full Peasant parity', () => {
  it('B130 S1: playing Full Peasant through Lessons keeps the occupation in play', () => {
    const response = setup({ inHand: true }).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B130 S2: Grain Utilization can pay one food and move the same person to Fencing', () => {
    const session = setup()

    const response = acceptJump(session, completeGrainUtilization(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'fencing')!.takenBy).toHaveLength(1)
  })

  it('B130 S3: declining the jump leaves the person on Grain Utilization and pays no food', () => {
    const session = setup()
    const pending = completeGrainUtilization(session)

    const response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'fencing')!.takenBy).toEqual([])
    expect(pending.interaction.stateId).toBe('wait')
  })

  it('B130 S4: an occupied Fencing space prevents the Grain Utilization jump', () => {
    const response = completeGrainUtilization(setup({ fencingOccupied: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .toBe('confirm-next-player')
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('B130 S5: no food prevents the Grain Utilization jump', () => {
    const response = completeGrainUtilization(setup({ food: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .toBe('confirm-next-player')
  })

  it('B130 S6: Fencing can pay one food and move the same person to Grain Utilization', () => {
    const session = setup()
    let response = session.takeAction(0, 'fencing')
    response = session.commitSelectionChoice(0, { edges: FENCE_EDGES, extraWood: 0 })
    response = resolveTriggerIfPresent(session, response, CARD_ID)

    response = acceptJump(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'fencing')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(1)
  })
})
