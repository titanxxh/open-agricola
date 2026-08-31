import { describe, expect, it } from 'vitest'

import '../../shared/cards/C/C004_WritingBoards'

import { GameSession } from '../game/authoritative-session'

const CARD_ID = 'C004_WritingBoards'

const buyMinor = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  let cardPrompt = response
  const directOption = cardPrompt.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (!directOption) {
    const improvementOption = cardPrompt.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'),
    )
    expect(improvementOption).toBeDefined()
    cardPrompt = session.resolveChoice(0, improvementOption!.value)
    expect(cardPrompt.ok).toBe(true)
    if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  }
  if (
    cardPrompt.interaction.sourceCard === CARD_ID ||
    cardPrompt.state.players[1]!.minorHand.includes(CARD_ID)
  ) return cardPrompt
  const cardOption = cardPrompt.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

const setup = (occupationCount: number) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const buyer = state.players[0]!
  buyer.minorHand = [CARD_ID]
  buyer.occupationPlayed = Array.from(
    { length: occupationCount },
    (_, index) => `__test_occupation_${index}__`,
  )
  buyer.resources.food = 1
  buyer.resources.wood = 0
  session.loadState(state)
  return session
}

describe('C004_WritingBoards session', () => {
  it.each([0, 2])(
    'pays 1 food, gains 1 wood per played occupation (%i), then passes',
    (occupationCount) => {
      const session = setup(occupationCount)

      const response = buyMinor(session, session.takeAction(0, 'meeting-place'))

      expect(response.ok).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({
        food: 0,
        wood: occupationCount,
      })
      expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
      expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    },
  )
})
