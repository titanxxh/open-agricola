import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D045_SheepWell'

const CARD_ID = 'D045_SheepWell'
const FILLER = '__test_placeholder__'

const setup = ({ sheep = 3, stone = 2, round = 5 } = {}) => {
  const session = new GameSession(6045, undefined, { playerCount: 2 })
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
    player.pastures = []
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 0,
      stone: index === 0 ? stone : 0,
      food: 20,
      grain: 0,
      vegetable: 0,
      sheep: index === 0 ? sheep : 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID, FILLER]
  if (sheep > 0) {
    player.pastures = [{
      id: 'sheep-well-pasture',
      tiles: [{ row: 0, col: 0 }],
      animalType: 'sheep',
      animalCount: sheep,
      size: 1,
      stables: 1,
    }]
  }
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

describe('D045 Sheep Well parity', () => {
  it('D045 S1: paying two stone plays Sheep Well and schedules one food per sheep', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, sheep: 3 })
    expect(futureRounds(response)).toEqual([6, 7, 8])
  })

  it('D045 S2: without two stone Sheep Well is unavailable and schedules no food', () => {
    const response = enterMinor(setup({ stone: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(futureRounds(response)).toEqual([])
  })

  it('D045 S3: Sheep Well can be played with no sheep and schedules no food', () => {
    const response = play(setup({ sheep: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    expect(futureRounds(response)).toEqual([])
  })

  it('D045 S4: remaining rounds cap the food scheduled from sheep', () => {
    const response = play(setup({ round: 13 }))

    expect(futureRounds(response)).toEqual([14])
  })

  it('D045 S5: scheduled Sheep Well food is received at the next round start', () => {
    const session = setup()
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
})
