import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D060_LargePottery'

const CARD_ID = 'D060_LargePottery'

const setupPurchase = (pottery = true) => {
  const session = new GameSession(60, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.improvements = pottery ? ['Major_Pottery'] : []
  player.resources.clay = 1
  player.resources.stone = 1
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const setupPlayed = (clay: number) => {
  const session = new GameSession(60, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  player.resources.clay = clay
  player.resources.food = 0
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  session.loadState(state)
  return session
}

describe('D060 Large Pottery parity', () => {
  it('D060 S1: playing Large Pottery pays clay and stone and returns Pottery', () => {
    const session = setupPurchase()
    const response = enterImprovementChoice(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0 })
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain('Major_Pottery')
    expect(response.state.availableMajorImprovements).toContain('Major_Pottery')
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 3 }))
  })

  it('D060 S2: the anytime exchange converts one clay to two food', () => {
    const session = setupPlayed(1)
    let response = session.takeAnytimeAction(0, 'exchange')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, 'bulk:0=1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 2 })
  })

  it.each([
    [0, 0],
    [3, 1],
    [5, 2],
    [6, 3],
    [7, 4],
  ])('D060 S3: %i clay scores %i bonus points', (clay, expected) => {
    const response = setupPlayed(clay).getState()
    const entry = response.scores[0]!.categories
      .find((category) => category.key === 'cardBonusVp')
      ?.entries.find((candidate) => candidate.cardId === CARD_ID)

    expect(entry?.score ?? 0).toBe(expected)
  })

  it('D060 S4: without Pottery Large Pottery is unavailable', () => {
    const response = enterImprovementChoice(setupPurchase(false))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.interaction.stateId !== 'wait'
      || !(response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)).toBe(true)
  })
})
