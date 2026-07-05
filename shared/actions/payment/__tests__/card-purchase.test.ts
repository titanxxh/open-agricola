import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { CardPurchasePayment } from '../index'

const player = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 1,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  improvements: ['Major_Fireplace1'],
  minorPlayed: [],
} as unknown as PlayerState)

const state = (p: PlayerState): GameState => ({
  players: [p],
} as unknown as GameState)

describe('CardPurchasePayment', () => {
  it('builds pay params with card-purchase metadata and returned-card scope', () => {
    const p = player()
    const preview = {
      cost: {
        fee: { clay: 1 },
        cards: { type: 'Major' as const, list: ['Major_Fireplace1'] },
      },
      candidateMetadataByFeeIndex: {
        0: { originalFeeIndex: 0, sources: ['C027_Blueprint'] },
      },
    }

    expect(CardPurchasePayment.buildPayParams(p, 'minor', 'A053_Claypipe', preview)).toEqual({
      cost: preview.cost,
      costType: 'minor-improvement',
      optionPrefix: 'pay:improvement:minor:A053_Claypipe',
      includeReturnedCard: true,
      playedCards: ['Major_Fireplace1'],
      candidateMetadataByFeeIndex: preview.candidateMetadataByFeeIndex,
    })
  })

  it('converts a selected payment receipt to improvement payment info', () => {
    const p = player()
    const result = CardPurchasePayment.resolvePayment({
      state: state(p),
      playerIndex: 0,
      player: p,
      kind: 'major',
      cardId: 'Major_Fireplace1',
      preview: {
        cost: { fees: [{ wood: 1 }] },
        candidateMetadataByFeeIndex: {
          0: {
            originalFeeIndex: 3,
            sources: ['A075_LumberMill'],
          },
        },
      },
      failure: { type: 'fail', errorKey: 'log.improvementFail' },
    })

    expect(result.type).toBe('selected')
    if (result.type !== 'selected') return
    expect(result.paymentInfo.resourcesPaid.wood).toBe(1)
    expect(result.paymentInfo.originalFeeIndex).toBe(3)
    expect(p.resources.wood).toBe(0)
  })
})
