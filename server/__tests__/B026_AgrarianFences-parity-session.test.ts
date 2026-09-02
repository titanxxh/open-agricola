import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/B/B026_AgrarianFences'

const CARD_ID = 'B026_AgrarianFences'
const FENCE_EDGES = ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5']

const setup = ({ wood = 4, grain = 0, field = false, played = true } = {}) => {
  const session = new GameSession(26, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = played ? ['__test_placeholder__'] : [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = { ...player.resources, wood, grain, vegetable: 0 }
  player.fields = field ? [{ row: 0, col: 2, crop: null, remaining: 0 }] : []
  session.loadState(state)
  return session
}

const outerSowBranch = (session: GameSession) => {
  const response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    candidate.labelParams?.actionNameKey === 'actions.sow.name'
  )
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const chooseLabel = (session: GameSession, response: SessionResponse, labelKey: string) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.labelKey === labelKey)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const commitSow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.farm.farmType !== 'sow') return response
  const field = response.interaction.request.farm.selectableFields[0]!.tile
  return session.commitSelectionChoice(0, { crops: [{ ...field, crop: 'grain' }] })
}

describe('B026 Agrarian Fences parity', () => {
  it('B026 S1: playing Agrarian Fences keeps the zero-cost card in play', () => {
    const session = setup({ played: false })
    const state = session.getState().state
    state.availableMajorImprovements = []
    session.loadState(state)

    const response = session.takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('B026 S2: Grain Utilization can build fences without seeds or baking', () => {
    const session = setup()
    let response = outerSowBranch(session)
    response = chooseLabel(session, response, 'actions.fencing.name')

    response = session.commitSelectionChoice(0, { edges: FENCE_EDGES, extraWood: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('B026 S3: Grain Utilization can sow and then build fences', () => {
    const session = setup({ grain: 1, field: true })
    let response = outerSowBranch(session)
    response = chooseLabel(session, response, 'ui.interactionAgrarianFencesSowAndFence')
    response = commitSow(session, response)

    response = session.commitSelectionChoice(0, { edges: FENCE_EDGES, extraWood: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, wood: 0 })
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('B026 S4: Grain Utilization can retain its normal sow without fencing', () => {
    const session = setup({ grain: 1, field: true })
    let response = outerSowBranch(session)
    response = chooseLabel(session, response, 'actions.sow.name')

    response = commitSow(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(response.state.players[0]!.resources.wood).toBe(4)
  })

  it('B026 S5: Agrarian Fences adds no fence branch outside Grain Utilization', () => {
    const response = setup({ grain: 1, field: true }).takeAction(0, 'cultivation')

    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.some((option) =>
      option.labelKey === 'actions.fencing.name' || option.sourceCard === CARD_ID
    )).toBe(false)
  })
})
