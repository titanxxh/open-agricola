import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B007_Wage'

const CARD_ID = 'B007_Wage'

const setup = (improvements: string[]) => {
  const session = new GameSession(7, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.improvements = improvements
  player.resources.food = 0
  session.loadState(state)
  return session
}

describe('B007 Wage parity', () => {
  it('B007 S1: Wage grants two food with no bottom-row major improvement', () => {
    const response = setup([]).takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B007 S2: two bottom-row major improvements add two food', () => {
    const response = setup(['Major_ClayOven', 'Major_Basket']).takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(4)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B007 S3: a top-row major improvement adds no food', () => {
    const response = setup(['Major_Well']).takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })
})
