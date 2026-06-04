import { defineOccupationCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B113_PatchCaregiver'
const base = makeCardFieldImpl(CARD_ID, {
  allowedCrops: ['grain', 'vegetable', 'wood', 'stone'],
  capacity: 1,
})

const cardImpl = {
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

export const B113_PatchCaregiver = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Patch Caregiver',
    deck: 'B',
    number: 113,
    category: 'CROP_PROVIDER',
    desc: ['When you play this card, you can choose to buy 1 <GRAIN> for 1 <FOOD>, or 1 <VEGETABLE> for 3 <FOOD>. This card is a field.'],
    cost: {},
    players: '1+',
    isField: true,
    cardField: { allowedCrops: ['grain', 'vegetable', 'wood', 'stone'], capacity: 1 },
  },
  impl: cardImpl,
})

export const B113_PatchCaregiver_impl = B113_PatchCaregiver.impl
