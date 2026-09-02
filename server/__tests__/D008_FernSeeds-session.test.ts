import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D008_FernSeeds'

const CARD_ID = 'D008_FernSeeds'

const setup = ({ empty = 1, planted = 2 } = {}) => {
  const session = new GameSession(8, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.resources.food = 0
  player.resources.grain = 0
  player.fields = [
    ...Array.from({ length: empty }, (_, col) => ({ row: 0, col, stacks: [] })),
    ...Array.from({ length: planted }, (_, col) => ({
      row: 1,
      col,
      stacks: [{ kind: col % 2 === 0 ? 'grain' as const : 'vegetable' as const, remaining: 1 }],
    })),
  ]
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playFernSeeds = (session: GameSession): SessionResponse => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession) => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return true
  return response.interaction.stateId === 'wait'
    && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)
}

describe('D008 Fern Seeds parity', () => {
  it('D008 S1: one empty and two planted fields let the card gain two food and sow its grain', () => {
    const session = setup()
    let response = playFernSeeds(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 1 })
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm?.farmType).toBe('sow')

    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields.find((field) => field.row === 0 && field.col === 0)?.stacks)
      .toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('D008 S2: no empty field keeps Fern Seeds unavailable', () => {
    expect(cardIsOffered(setup({ empty: 0, planted: 2 }))).toBe(false)
  })

  it('D008 S3: only one planted field keeps Fern Seeds unavailable', () => {
    expect(cardIsOffered(setup({ empty: 1, planted: 1 }))).toBe(false)
  })

  it('D008 S4: the immediate sow cannot be skipped and is limited to one field', () => {
    const session = setup({ empty: 2, planted: 2 })
    let response = playFernSeeds(session)

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.some((option) => option.value === '__skip__') ?? false).toBe(false)
    expect(response.interaction.request.farm?.farmType).toBe('sow')

    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.filter((field) => field.stacks.length > 0)).toHaveLength(3)
  })
})
