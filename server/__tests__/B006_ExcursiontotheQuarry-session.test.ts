import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B006_ExcursiontotheQuarry'

const CARD_ID = 'B006_ExcursiontotheQuarry'

const setup = ({ occupations = 1, food = 2, family = 2 } = {}) => {
  const session = new GameSession(6, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `__test_occupation_${index}__`)
  player.resources = { ...player.resources, food, stone: 0 }
  player.workers.forEach((worker, index) => {
    worker.isActive = index < family
    worker.isNewborn = false
  })
  session.loadState(state)
  return session
}

describe('B006 Excursion to the Quarry parity', () => {
  it('B006 S1: two people grant two stone after paying two food', () => {
    const response = setup().takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 2 })
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B006 S2: three people grant three stone', () => {
    const response = setup({ family: 3 }).takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 3 })
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B006 S3: no occupation keeps Excursion to the Quarry unavailable', () => {
    const response = setup({ occupations: 0 }).takeAction(0, 'major-improvement')

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, stone: 0 })
  })

  it('B006 S4: less than two food keeps Excursion to the Quarry unavailable', () => {
    const response = setup({ food: 1 }).takeAction(0, 'major-improvement')

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 0 })
  })
})
