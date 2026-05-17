import { makeCardFieldImpl } from '../helpers/card-field'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B113_PatchCaregiver } from '../../cards-display/B/B113_PatchCaregiver'

const CARD_ID = B113_PatchCaregiver.id

const base = makeCardFieldImpl(CARD_ID, {
  allowedCrops: ['grain', 'vegetable', 'wood', 'stone'],
  capacity: 1,
})

export const B113_PatchCaregiver_impl = {
  ...base,
  effect: {
    ...base.effect,
    id: CARD_ID,
    onBuy: (_state, _player) => ({
      type: 'xor' as const,
      optional: true,
      children: [
        {
          type: 'seq' as const,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
            gainLeaf(CARD_ID, { grain: 1 }),
          ],
        },
        {
          type: 'seq' as const,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 3 } }),
            gainLeaf(CARD_ID, { vegetable: 1 }),
          ],
        },
      ],
    }),
  },
} satisfies CardImpl
