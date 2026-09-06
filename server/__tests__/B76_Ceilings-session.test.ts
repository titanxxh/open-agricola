import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B076_Ceilings'

const CARD_ID = 'B076_Ceilings'
const FILLER = '__test_placeholder__'

const setup = ({ occupations = 1, clay = 1, round = 5, played = false } = {}) => {
  const session = new GameSession(5076, undefined, { playerCount: 2 })
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
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `STUB_OCC_${index}`)
  player.resources = {
    ...player.resources, wood: 0, clay, reed: 1, stone: 0, food: 20, grain: 0, vegetable: 0,
  }
  const redevelopment = state.actionSpaces.find((space) => space.id === 'house-redevelopment')!
  redevelopment.roundAvailable = 1
  redevelopment.takenBy = []
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
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.wood ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.wood ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

const renovate = (session: GameSession) => {
  let response = session.takeAction(0, 'house-redevelopment')
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      const clay = response.interaction.request.options?.find((option) => option.value === 'clay')
      expect(clay).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, clay!.value)
      continue
    }
    const skip = response.interaction.request.options?.find((option) =>
      option.value === '__skip__' || option.value === 'skip')
    if (!skip) break
    response = session.resolveChoice(response.interaction.playerIndex, skip.value)
  }
  return response
}

describe('B076 Ceilings parity', () => {
  it('B076 S1: one occupation and one clay play Ceilings and schedule wood on the next five rounds', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(futureRounds(response)).toEqual([6, 7, 8, 9, 10])
  })

  it('B076 S2: without an occupation Ceilings remains unavailable without spending clay', () => {
    const response = enterMinor(setup({ occupations: 0 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(futureRounds(response)).toEqual([])
  })

  it('B076 S3: late Ceilings schedules only rounds through fourteen', () => {
    const response = play(setup({ round: 12 }))
    expect(futureRounds(response)).toEqual([13, 14])
  })

  it('B076 S4: scheduled Ceilings wood is received at the next round start', () => {
    const session = setup()
    play(session)
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(futureRounds(response)).toEqual([7, 8, 9, 10])
  })

  it('B076 S5: the next renovation removes all remaining Ceilings wood and flags the card', () => {
    const session = setup()
    const played = play(session)
    expect(futureRounds(played)).toEqual([6, 7, 8, 9, 10])
    const state = session.getState().state
    state.players[0]!.resources.clay = 2
    state.players[0]!.resources.reed = 1
    session.loadState(state)

    const response = renovate(session)

    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(futureRounds(response)).toEqual([])
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })
})
