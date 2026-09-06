import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C021_HeartofStone'

const CARD_ID = 'C021_HeartofStone'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, food = 4, round = 5, rooms = 3 } = {}) => {
  const session = new GameSession(5021, undefined, { playerCount: 2 })
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
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.food = food
  player.rooms = rooms
  player.roomTiles = Array.from({ length: rooms }, (_, index) => ({ row: index, col: 0 }))
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

const prepareRoundEnd = (session: GameSession, round: number, revealed: string) => {
  const state = session.getState().state
  state.round = round
  state.roundActionOrder[round] = revealed
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
}

const accept = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected Heart of Stone choice')
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('C021 Heart of Stone parity', () => {
  it('C021 S1: paying four food plays Heart of Stone', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  for (const [scenario, round, quarry] of [
    ['S2', 6, 'western-quarry'],
    ['S3', 12, 'eastern-quarry'],
  ] as const) {
    it(`C021 ${scenario}: revealing a Quarry offers and completes room-limited family growth`, () => {
      const session = setup({ played: true, food: 20, round })
      prepareRoundEnd(session, round, quarry)

      const response = accept(session, session.performRoundEnd())

      expect(response.state.round).toBe(round + 1)
      expect(familySize(response.state.players[0]!)).toBe(3)
    })
  }

  it('C021 S4: Quarry family growth may be declined', () => {
    const session = setup({ played: true, food: 20, round: 6 })
    prepareRoundEnd(session, 6, 'western-quarry')
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(familySize(response.state.players[0]!)).toBe(2)
  })

  it('C021 S5: revealing a non-Quarry action does not offer family growth', () => {
    const session = setup({ played: true, food: 20, round: 5 })
    prepareRoundEnd(session, 5, 'vegetable-seeds')

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : null).not.toBe(CARD_ID)
  })

  it('C021 S6: revealing a Quarry with no free room does not offer family growth', () => {
    const session = setup({ played: true, food: 20, round: 6, rooms: 2 })
    prepareRoundEnd(session, 6, 'western-quarry')

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(7)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : null).not.toBe(CARD_ID)
  })
})
