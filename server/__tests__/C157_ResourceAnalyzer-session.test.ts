import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C157_ResourceAnalyzer'

const CARD_ID = 'C157_ResourceAnalyzer'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  owner = {},
  opponents = [],
}: {
  played?: boolean
  owner?: Partial<Resource>
  opponents?: Partial<Resource>[]
} = {}) => {
  const session = new GameSession(5157, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      ...(index === 0 ? owner : (opponents[index - 1] ?? {})),
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  session.loadState(state)
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

describe('C157 Resource Analyzer parity', () => {
  it('C157 S1: Resource Analyzer can be played as the first occupation for no food', () => {
    const session = setup({ played: false })
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C157 S2: strict leads in exactly two building-resource types grant one food', () => {
    const session = setup({
      owner: { wood: 2, clay: 2 },
      opponents: [{ wood: 1, clay: 1 }, { wood: 0, clay: 1 }, { wood: 1, clay: 0 }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(ownerFood(response)).toBe(foodBefore + 1)
  })

  it('C157 S3: a strict lead in only one building-resource type grants no food', () => {
    const session = setup({
      owner: { wood: 2, clay: 1 },
      opponents: [{ wood: 1, clay: 1 }, { wood: 0, clay: 0 }, { wood: 1, clay: 0 }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(ownerFood(response)).toBe(foodBefore)
  })

  it('C157 S4: tying an opponent is not being strictly ahead for that resource type', () => {
    const session = setup({
      owner: { wood: 2, clay: 2 },
      opponents: [{ wood: 1, clay: 2 }, { wood: 0, clay: 1 }, { wood: 1, clay: 0 }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(ownerFood(response)).toBe(foodBefore)
  })

  it('C157 S5: leading all four building-resource types still grants exactly one food', () => {
    const session = setup({
      owner: { wood: 2, clay: 2, reed: 2, stone: 2 },
      opponents: [
        { wood: 1, clay: 1, reed: 1, stone: 1 },
        { wood: 0, clay: 1, reed: 0, stone: 1 },
        { wood: 1, clay: 0, reed: 1, stone: 0 },
      ],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = endRound(session)

    expect(ownerFood(response)).toBe(foodBefore + 1)
  })

  it('C157 S6: Resource Analyzer checks and rewards again before the following round', () => {
    const session = setup({
      owner: { wood: 2, clay: 2 },
      opponents: [{ wood: 1, clay: 1 }, { wood: 0, clay: 1 }, { wood: 1, clay: 0 }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const first = endRound(session)
    expect(ownerFood(first)).toBe(foodBefore + 1)
    const second = endRound(session)

    expect(second.ok, second.error).toBe(true)
    expect(second.state.round).toBe(7)
    expect(ownerFood(second)).toBe(foodBefore + 2)
  })
})
