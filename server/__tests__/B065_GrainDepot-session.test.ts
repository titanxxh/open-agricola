import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B065_GrainDepot'

const CARD_ID = 'B065_GrainDepot'
const FILLER = '__test_placeholder__'

const setup = (resource: keyof Resource | null, { amount = 2, round = 5 } = {}) => {
  const session = new GameSession(5065, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
    ...(resource ? { [resource]: amount } : {}),
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
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = response.interaction.request.options?.find((candidate) => candidate.value.startsWith(`pay:improvement:minor:${CARD_ID}:`))
    expect(payment).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
  }
  return response
}

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.grain ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.grain ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('B065 Grain Depot parity', () => {
  for (const [scenario, resource, rounds] of [
    ['S1', 'wood', [6, 7]],
    ['S2', 'clay', [6, 7, 8]],
    ['S3', 'stone', [6, 7, 8, 9]],
  ] as const) {
    it(`B065 ${scenario}: paying two ${resource} schedules grain for ${rounds.length} rounds`, () => {
      const response = playMinor(setup(resource))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources[resource]).toBe(0)
      expect(futureRounds(response)).toEqual(rounds)
    })
  }

  it('B065 S4: without two of any building resource Grain Depot remains unavailable', () => {
    const response = enterMinor(setup(null, { amount: 0 }))

    expect(response.interaction.stateId === 'wait'
      ? (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(futureRounds(response)).toEqual([])
  })

  it('B065 S5: a round-thirteen wood payment schedules only reachable round fourteen grain', () => {
    const response = playMinor(setup('wood', { round: 13 }))

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response)).toEqual([14])
  })

  it('B065 S6: scheduled grain is received at the start of the next round', () => {
    const session = setup('wood')
    playMinor(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(futureRounds(response)).toEqual([7])
  })
})
