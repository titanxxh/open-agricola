import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { Field } from '../../shared/contract/types'

import '../../shared/cards/B/B093_Confidant'

const CARD_ID = 'B093_Confidant'
const FILLER = '__test_placeholder__'

const setup = ({ food = 4, round = 5 }: { food?: number; round?: number } = {}) => {
  const session = new GameSession(5393 + round, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  state.players[0]!.occupationHand = [CARD_ID]
  state.players[0]!.resources.food = food
  state.players[0]!.resources.wood = 4
  state.players[0]!.resources.grain = 1
  state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] } satisfies Field]
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.ok || !response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return response
}

const schedule = (session: GameSession, response: SessionResponse, count: 2 | 3 | 4) => {
  expect(response.ok, response.error).toBe(true)
  const alreadyScheduled = response.state.futureMeeples.filter(
    (entry) => entry.cardId === CARD_ID && entry.resources.food === 1,
  )
  if (alreadyScheduled.length === count) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const options = response.interaction.request.options ?? []
  expect(options).toHaveLength(Math.min(4, 14 - response.state.round) - 1)
  expect(options.some((option) => option.value === '__skip__')).toBe(false)
  const option = options[count - 2]
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const scheduledRounds = (response: SessionResponse) =>
  response.state.futureMeeples
    .filter((entry) => entry.cardId === CARD_ID && entry.resources.food === 1)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

describe('B093 Confidant parity', () => {
  it('B093 S1: two food schedules two future food tokens and spends both food', () => {
    const session = setup({ food: 2 })

    const response = schedule(session, play(session), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(scheduledRounds(response)).toEqual([6, 7])
  })

  it('B093 S2: four food can choose the four-round schedule', () => {
    const session = setup({ food: 4 })

    const response = schedule(session, play(session), 4)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(scheduledRounds(response)).toEqual([6, 7, 8, 9])
  })

  it('B093 S3: at round twelve only the two-round schedule remains and is selected automatically', () => {
    const response = play(setup({ food: 4, round: 12 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(scheduledRounds(response)).toEqual([13, 14])
  })

  it('B093 S4: one food makes Confidant unavailable without consuming the Lessons action', () => {
    const response = play(setup({ food: 1 }))

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.occupationHand).toContain(CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.workers.some((worker) => worker.action === 'lessons')).toBe(false)
    expect(scheduledRounds(response)).toEqual([])
  })

  it('B093 S5: receiving future food offers a skippable Sow-or-Build-Fences choice', () => {
    const session = setup({ food: 2 })
    const scheduled = schedule(session, play(session), 2)
    expect(scheduledRounds(scheduled)).toEqual([6, 7])
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    const foodBefore = state.players[0]!.resources.food
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(foodBefore + 1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const options = response.interaction.request.options ?? []
    expect(options.some((option) => option.value === '__skip__')).toBe(true)
    expect(options.some((option) => option.labelKey === 'actions.sow.name')).toBe(true)
    expect(options.some((option) => option.labelKey === 'actions.fencing.name')).toBe(true)

    const skipped = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(skipped.ok, skipped.error).toBe(true)
    expect(scheduledRounds(skipped)).toEqual([7])
  })
})
