import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C159_FishermansFriend'

const CARD_ID = 'C159_FishermansFriend'
const FILLER = '__test_placeholder__'

const setFood = (session: GameSession, spaceId: string, count: number) => {
  const space = session.state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources.food = count
  space.takenBy = []
}

const setup = ({ played = true, travelingFood = 0, fishingFood = 0 } = {}) => {
  const session = new GameSession(5159, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  session.loadState(state)
  setFood(session, 'traveling-players', travelingFood)
  setFood(session, 'fishing', fishingFood)
  session.loadState(session.state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

const endRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const ownerFood = (response: SessionResponse) => response.state.players[0]!.resources.food

describe("C159 Fisherman's Friend parity", () => {
  it("C159 S1: Fisherman's Friend can be played as the first occupation for no food", () => {
    const session = setup({ played: false })
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C159 S2: a two-food Traveling Players lead grants exactly two food', () => {
    const session = setup({ travelingFood: 4, fishingFood: 2 })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(ownerFood(response)).toBe(foodBefore + 2)
  })

  it('C159 S3: equal food on Traveling Players and Fishing grants no food', () => {
    const session = setup({ travelingFood: 3, fishingFood: 3 })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(ownerFood(response)).toBe(foodBefore)
  })

  it('C159 S4: less food on Traveling Players than Fishing grants no food', () => {
    const session = setup({ travelingFood: 1, fishingFood: 3 })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(ownerFood(response)).toBe(foodBefore)
  })

  it("C159 S5: Fisherman's Friend recalculates the current difference each round", () => {
    const session = setup({ travelingFood: 2, fishingFood: 1 })
    const foodBefore = session.state.players[0]!.resources.food
    const first = endRound(session)
    expect(ownerFood(first)).toBe(foodBefore + 1)
    setFood(session, 'traveling-players', 5)
    setFood(session, 'fishing', 1)
    session.loadState(session.state)

    const second = endRound(session)

    expect(second.ok, second.error).toBe(true)
    expect(second.state.round).toBe(7)
    expect(ownerFood(second)).toBe(foodBefore + 5)
  })
})
