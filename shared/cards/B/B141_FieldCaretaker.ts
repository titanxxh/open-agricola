import { makeCardFieldImpl } from '../helpers/card-field'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B141_FieldCaretaker } from '../../cards-display/B/B141_FieldCaretaker'

const CARD_ID = B141_FieldCaretaker.id

const base = makeCardFieldImpl(CARD_ID, {
  allowedCrops: ['grain', 'vegetable', 'wood', 'stone'],
  capacity: 1,
})

export const B141_FieldCaretaker_impl = {
  ...base,
  effect: {
    ...base.effect,
    id: CARD_ID,
    onBuy: (_state, _player) => ({
      type: 'xor' as const,
      optional: true,
      children: [
        gainLeaf(CARD_ID, { grain: 1 }),
        {
          type: 'seq' as const,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { clay: 1 } }),
            gainLeaf(CARD_ID, { grain: 2 }),
          ],
        },
        {
          type: 'seq' as const,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { clay: 3 } }),
            gainLeaf(CARD_ID, { grain: 3 }),
          ],
        },
      ],
    }),
  },
} satisfies CardImpl
