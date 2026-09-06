import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D044_ForestWell'

const CARD_ID = 'D044_ForestWell'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A100_Curator', 'A106_SlurrySpreader', 'A167_BreederBuyer']

const setup = ({
  wood = 3, food = 1, stone = 1, occupations = 2, round = 5,
} = {}) => {
  const session = new GameSession(6044, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: index === 0 ? wood : 0,
      clay: 0,
      reed: 0,
      stone: index === 0 ? stone : 0,
      food: index === 0 ? food : 20,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID, FILLER]
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('D044 Forest Well parity', () => {
  it('D044 S1: two occupations and the printed cost play Forest Well and schedule food for one round per wood', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0, stone: 0 })
    expect(futureRounds(response)).toEqual([6, 7, 8])
  })

  it('D044 S2: fewer than two occupations keeps Forest Well unavailable without paying its cost', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 1 })
    expect(futureRounds(response)).toEqual([])
  })

  it('D044 S3: Forest Well can be played with no wood and schedules no food', () => {
    const response = play(setup({ wood: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 0 })
    expect(futureRounds(response)).toEqual([])
  })

  it('D044 S4: remaining rounds cap the number of food even when the owner has more wood', () => {
    const response = play(setup({ wood: 3, round: 13 }))

    expect(futureRounds(response)).toEqual([14])
  })

  it('D044 S5: scheduled Forest Well food is received at the next round start', () => {
    const session = setup({ food: 21 })
    play(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response)).toEqual([7, 8])
  })

  it('D044 S6: without the required stone Forest Well is unavailable and pays nothing', () => {
    const response = enterMinor(setup({ stone: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(futureRounds(response)).toEqual([])
  })
})
