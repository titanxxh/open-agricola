import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B004_WoodPile'

const CARD_ID = 'B004_WoodPile'

const setup = (placements: string[]) => {
  const session = new GameSession(4, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.resources.wood = 0
  const family = Math.max(2, placements.length + 1)
  player.workers.forEach((worker, index) => {
    worker.isActive = index < family
    worker.isNewborn = false
  })
  placements.forEach((spaceId, index) => {
    state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{
      playerId: player.id,
      workerId: player.workers[index]!.id,
    }]
  })
  session.loadState(state)
  return session
}

const play = (session: GameSession) => session.takeAction(0, 'major-improvement')

describe('B004 Wood Pile parity', () => {
  it('B004 S1: no people on accumulation spaces grants no wood', () => {
    const response = play(setup([]))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B004 S2: one occupied accumulation space grants one wood', () => {
    const response = play(setup(['forest']))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B004 S3: two occupied accumulation spaces grant two wood', () => {
    const response = play(setup(['forest', 'clay-pit']))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B004 S4: a person on a non-accumulation space grants no wood', () => {
    const response = play(setup(['farmland']))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })
})
