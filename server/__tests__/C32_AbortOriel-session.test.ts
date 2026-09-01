import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C032_AbortOriel'

const CARD_ID = 'C032_AbortOriel'

const setup = (actorCards: number, opponentCards: number) => {
  const session = new GameSession(32, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const actor = state.players[0]!
  actor.minorHand = [CARD_ID]
  actor.minorPlayed = Array.from({ length: actorCards }, (_, index) => `actor-minor-${index}`)
  actor.resources.clay = 2
  state.players[1]!.occupationPlayed = Array.from(
    { length: opponentCards },
    (_, index) => `opponent-occupation-${index}`,
  )
  session.loadState(state)
  return session
}

const enterMinorSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok).toBe(true)
  const improvement = response.interaction.stateId === 'wait'
    ? response.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    : undefined
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

describe('C032_AbortOriel session', () => {
  it('C032 S1 actor can play Abort Oriel as their fifth front card', () => {
    const session = setup(4, 0)
    const scoreBefore = session.getState().scores[0]!.total
    const response = enterMinorSelection(session)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.minorHand).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.scores[0]!.total).toBe(scoreBefore + 3)
  })

  it('C032 S2 actor cannot play Abort Oriel after already having five front cards', () => {
    const session = setup(5, 0)
    const response = enterMinorSelection(session)

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('C032 S3 actor cannot play Abort Oriel when an opponent has five front cards', () => {
    const session = setup(0, 5)
    const response = enterMinorSelection(session)

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })
})
