import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C047_GardenClaw'
import '../../shared/cards/B/B068_Beanfield'

const CARD_ID = 'C047_GardenClaw'
const FILLER = '__test_placeholder__'

const setup = ({ plantedFields = 1, cardField = false, round = 5 } = {}) => {
  const session = new GameSession(5047, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.fields = Array.from({ length: plantedFields }, (_, index) => ({
    row: 0, col: index + 2, stacks: [{ kind: 'grain' as const, remaining: 1 }],
  }))
  if (cardField) {
    player.minorPlayed.push('B068_Beanfield')
    player.cardStates.B068_Beanfield = {
      extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] },
    }
  }
  player.resources = {
    ...player.resources, wood: 1, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
  }
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

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('C047 Garden Claw parity', () => {
  it('C047 S1: one planted farmyard field schedules food on the next three rounds', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response)).toEqual([6, 7, 8])
  })

  it('C047 S2: an empty field does not schedule food', () => {
    const session = setup({ plantedFields: 0 })
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    session.loadState(session.state)

    const response = play(session)

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response)).toEqual([])
  })

  it('C047 S3: a planted Card Field counts once alongside a planted farmyard field', () => {
    const response = play(setup({ cardField: true }))
    expect(futureRounds(response)).toEqual([6, 7, 8, 9, 10, 11])
  })

  it('C047 S4: a late play truncates the three-per-planted-field schedule at round fourteen', () => {
    const response = play(setup({ plantedFields: 2, round: 12 }))
    expect(futureRounds(response)).toEqual([13, 14])
  })

  it('C047 S5: scheduled Garden Claw food is received at the next round start', () => {
    const session = setup()
    play(session)
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
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response)).toEqual([7, 8])
  })
})
