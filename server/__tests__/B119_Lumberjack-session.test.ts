import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { setFencesForTest, setPalisadesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import '../../shared/cards/B/B119_Lumberjack'

describe('B119 Lumberjack — session regression (palisades excluded)', () => {
  it('queues future wood meeples only for fences, not palisades', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setFencesForTest(player, 3)
    setPalisadesForTest(player, 2)
    session.loadState(state)

    const workingState = session.getState().state
    const workingPlayer = workingState.players[0]!
    const effect = getCardEffect('B119_Lumberjack')!
    effect.onBuy!(workingState, workingPlayer)

    // onBuy calls queueFutureMeeplesFlow → pushes request into pendingFutureMeeples.
    const pendingForCard = workingState.pendingFutureMeeples.filter(
      (m: { cardId?: string }) => m.cardId === 'B119_Lumberjack',
    )
    // 3 fence segments → count 3; 2 palisades ignored.
    expect(pendingForCard).toHaveLength(1)
    expect(pendingForCard[0]!.count).toBe(3)
  })
})
