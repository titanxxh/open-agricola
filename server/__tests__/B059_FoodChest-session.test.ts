import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B059_FoodChest'

const CARD_ID = 'B059_FoodChest'

const setup = (wood: number) => {
  const session = new GameSession(59, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.resources = { ...player.resources, wood, food: 0 }
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession, actionId: 'major-improvement' | 'meeting-place') => {
  let response: SessionResponse = session.takeAction(0, actionId)
  for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-')
    )
    if (!option) break
    response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('B059 Food Chest parity', () => {
  it('B059 S1: Major Improvement play grants two food after paying one wood', () => {
    const session = setup(1)

    const response = playMinor(session, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
  })

  it('B059 S2: Meeting Place play grants two food after paying one wood', () => {
    const session = setup(1)

    const response = playMinor(session, 'meeting-place')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
  })

  it('B059 S3: no wood keeps Food Chest unavailable on either action space', () => {
    const major = playMinor(setup(0), 'major-improvement')
    const meeting = playMinor(setup(0), 'meeting-place')

    expect(major.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(meeting.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(major.state.players[0]!.resources.food).toBe(0)
    expect(meeting.state.players[0]!.resources.food).toBe(0)
  })
})
