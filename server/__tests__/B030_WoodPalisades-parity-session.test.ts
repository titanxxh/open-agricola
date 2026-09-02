import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeScores } from '../../shared/domain/scoring'
import { getFenceCount, getPalisadeCount } from '../../shared/actions/effects/fencing'

import '../../shared/cards/B/B030_WoodPalisades'

const CARD_ID = 'B030_WoodPalisades'
const FENCES = ['H-1-0', 'V-0-1']
const PALISADES = ['H-0-0', 'V-0-0']

const setup = (wood: number, played = true) => {
  const session = new GameSession(30, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 3
  const player = state.players[0]!
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = { ...player.resources, wood, food: 0 }
  session.loadState(state)
  return session
}

const fence = (session: GameSession) => {
  const pending = session.takeAction(0, 'fencing')
  expect(pending.ok, pending.error).toBe(true)
  return session.commitSelectionChoice(0, {
    edges: FENCES,
    palisadeEdges: PALISADES,
    extraWood: 0,
  })
}

describe('B030 Wood Palisades parity', () => {
  it('B030 S1: playing Wood Palisades costs one food and keeps the card in play', () => {
    const session = new GameSession(30, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 3
    state.availableMajorImprovements = []
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 1
    session.loadState(state)

    const response = session.takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('B030 S2: two border palisades and two fences cost six wood and score two points', () => {
    const session = setup(6)

    const response = fence(session)

    expect(response.ok, response.error).toBe(true)
    const player = response.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(getFenceCount(player)).toBe(2)
    expect(getPalisadeCount(player)).toBe(2)
    const score = computeScores(response.state).find((entry) => entry.playerId === player.id)!
    expect(score.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(2)
  })

  it('B030 S3: five wood cannot pay for two palisades and two fences', () => {
    const response = fence(setup(5))

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(5)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

  it('B030 S4: palisades cannot be placed without Wood Palisades in play', () => {
    const response = fence(setup(8, false))

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(8)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})
