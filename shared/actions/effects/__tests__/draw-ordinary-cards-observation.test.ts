import { describe, expect, it } from 'vitest'
import type { ActionExecutionContext, ProtectedObservation } from '../../../contract/types'
import { drawOrdinaryCardsAction } from '../internal/draw-ordinary-cards'

describe('draw-ordinary-cards protected observation', () => {
  it('reports the recipient when hidden cards are drawn', () => {
    const observations: ProtectedObservation[] = []
    const context = {
      state: { ordinaryCardDecks: { occupation: ['A', 'B'], minor: [] } },
      player: { id: 'p1', occupationHand: [], minorHand: [] },
      space: { id: 'test' },
      actionContext: { cardType: 'occupation', count: 1 },
      reportProtectedObservation: (observation: ProtectedObservation) => observations.push(observation),
    } as unknown as ActionExecutionContext

    drawOrdinaryCardsAction.execute!(context)

    expect(observations).toEqual([{
      kind: 'hidden-information',
      recipientPlayerIds: ['p1'],
    }])
  })
})
