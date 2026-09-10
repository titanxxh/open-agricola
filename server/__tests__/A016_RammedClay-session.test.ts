import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A016_RammedClay } from '../../shared/cards/A/A016_RammedClay'

const CARD_ID = 'A016_RammedClay'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({ played = false, wood = 0, clay = 0 } = {}) => {
  const session = new GameSession(7016, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.activeModifiers = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.activeModifiers = played ? [...(A016_RammedClay.impl.modifiers ?? [])] : []
  owner.resources.wood = wood
  owner.resources.clay = clay
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === CARD_ID)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const buildFences = (session: GameSession, paid: { wood: number; clay: number }) => {
  let response = session.takeAction(0, 'fencing')
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
  })
  response = session.commitSelectionChoice(0, {
    edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0,
  })
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = options(response).find((option) => {
      const resources = option.effectPreview?.resourcesPaid
        ?? (option.labelParams as { resourcesPaid?: Record<string, number> } | undefined)?.resourcesPaid
      return resources?.wood === paid.wood && resources?.clay === paid.clay
    })
    expect(payment, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
  }
  return response
}

describe('A016 Rammed Clay parity', () => {
  it('A016 S1: playing Rammed Clay for free immediately gains one clay', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })

  it('A016 S2: four clay can replace all four wood when fencing one pasture', () => {
    const response = buildFences(setup({ played: true, clay: 4 }), { wood: 0, clay: 4 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('A016 S3: wood and clay can be mixed in the same fencing payment', () => {
    const response = buildFences(setup({ played: true, wood: 2, clay: 2 }), { wood: 2, clay: 2 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })
})
