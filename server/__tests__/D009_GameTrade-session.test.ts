import { describe, expect, it } from 'vitest'

import '../../shared/cards/D/D009_GameTrade'

import { GameSession } from '../game/authoritative-session'

const CARD_ID = 'D009_GameTrade'

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

describe('D009_GameTrade session', () => {
  it('pays 2 sheep, gains 1 boar and 1 cattle, reorganizes them, then passes', () => {
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
    buyer.resources.sheep = 2
    buyer.pastures = [
      {
        id: 'boar-pasture',
        size: 1,
        tiles: [{ row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
      {
        id: 'cattle-pasture',
        size: 1,
        tiles: [{ row: 0, col: 2 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    session.loadState(state)

    let response = buyMinor(session, session.takeAction(0, 'meeting-place'))

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1, cattle: 1 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected animal reorganization')
    expect(response.interaction.request.kind).toBe('animal-reorg')

    response = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'boar-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
        { id: 'cattle-pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
      ],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'boar-pasture', animalType: 'boar', animalCount: 1 }),
      expect.objectContaining({ id: 'cattle-pasture', animalType: 'cattle', animalCount: 1 }),
    ]))
  })
})
