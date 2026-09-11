import { expect } from 'vitest'
import { GameSession, type SessionResponse } from '../../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../../shared/session/serialization'
import { stabilizeRandomHands } from './stabilize-random-hands'

const bonus = (response: SessionResponse, playerIndex: number, cardId: string) => response.scores[playerIndex]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

export const setupSharedScoring = (cardId: string) => {
  const session = new GameSession(7135, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  session.state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.cardStates = {}
    player.resources.vegetable = 0
    player.resources.begging = 0
  })
  session.state.players[0]!.occupationPlayed = [cardId]
  session.loadState(session.state)
  return session
}

export const expectSharedBonuses = (session: GameSession, cardId: string, expected: number[]) => {
  const first = session.getState()
  expect(
    first.scores.map((_, index) => bonus(first, index, cardId)),
    JSON.stringify(first.scores.map((score) =>
      score.categories.map((category) => ({ key: category.key, total: category.total })))),
  ).toEqual(expected)
  first.scores.forEach((score, index) => {
    const entry = score.categories.flatMap((category) => category.entries)
      .find((candidate) => candidate.type === 'bonus' && candidate.cardId === cardId)
    expect(score.total).toBe(score.categories.reduce((sum, category) => sum + category.total, 0))
    if (expected[index] === 0) expect(entry).toBeUndefined()
    else expect(entry).toMatchObject({ cardId, cardType: 'occupation', score: expected[index] })
  })
  expect(session.getState().scores).toEqual(first.scores)
  const snapshot = serializeSessionSnapshot(session.state, session)
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  expect(restored.getState().scores).toEqual(first.scores)
}
