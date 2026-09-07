import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { computeScores } from '../../shared/domain/scoring'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B068_Beanfield'

const BEANFIELD = 'B068_Beanfield'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

const beanfieldSetup = ({
  occupations = 2, food = 1, grain = 0, vegetable = 0, round = 5, played = false,
} = {}) => {
  const session = new GameSession(5268, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [BEANFIELD]
  player.minorPlayed = played ? [BEANFIELD] : []
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.resources = {
    ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food, grain, vegetable,
  }
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession): SessionResponse => {
  const response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(BEANFIELD)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === BEANFIELD)
  return card ? session.resolveChoice(response.interaction.playerIndex, card.value) : response
}

const sowBeanfield = (session: GameSession, crop: 'grain' | 'vegetable') => {
  const started = session.takeAction(0, 'grain-utilization')
  expect(started.ok, started.error).toBe(true)
  expect(started.interaction.stateId).toBe('wait')
  return session.commitSelectionChoice(0, { crops: [{ row: -1, col: 2068, crop }] })
}

const printedVp = (response: SessionResponse) => {
  const player = response.state.players[0]!
  const score = computeScores(response.state).find((summary) => summary.playerId === player.id)!
  return score.categories.find((category) => category.key === 'cards')!.entries
    .find((entry) => 'cardId' in entry && entry.cardId === BEANFIELD)?.score
}

describe('B068 Beanfield parity', () => {
  it('B068 S1: two occupations and one food play Beanfield as a one-point card field', () => {
    const response = playMinor(beanfieldSetup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(BEANFIELD)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(printedVp(response)).toBe(1)
  })

  it('B068 S2: fewer than two occupations keep Beanfield unavailable without spending food', () => {
    const response = enterMinor(beanfieldSetup({ occupations: 1 }))

    expect(response.state.players[0]!.minorHand).toContain(BEANFIELD)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy).toEqual([])
  })

  it('B068 S3: Beanfield accepts vegetable sowing and receives the normal two vegetables', () => {
    const session = beanfieldSetup({ vegetable: 1, food: 20, played: true, round: 14 })

    const response = sowBeanfield(session, 'vegetable')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.cardStates[BEANFIELD]?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'vegetable', remaining: 2 }])
  })

  it('B068 S4: Beanfield rejects grain sowing and still accepts a vegetable retry', () => {
    const session = beanfieldSetup({ grain: 1, vegetable: 1, food: 20, played: true, round: 14 })

    const rejected = sowBeanfield(session, 'grain')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
    expect(rejected.state.players[0]!.cardStates[BEANFIELD]?.extraData?.cardFieldStacks ?? [null])
      .toEqual([null])

    const accepted = session.commitSelectionChoice(0, {
      crops: [{ row: -1, col: 2068, crop: 'vegetable' }],
    })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.resources.grain).toBe(1)
    expect(accepted.state.players[0]!.cardStates[BEANFIELD]?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'vegetable', remaining: 2 }])
  })

  it('B068 S5: a harvest reaps one vegetable from Beanfield and leaves one on the card', () => {
    const session = beanfieldSetup({ vegetable: 1, food: 20, round: 14, played: true })
    sowBeanfield(session, 'vegetable')
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[BEANFIELD]?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'vegetable', remaining: 1 }])
  })
})
