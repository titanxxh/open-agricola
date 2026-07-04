import { defineOccupationCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B141_FieldCaretaker'
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

export const B141_FieldCaretaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Field Caretaker',
    deck: 'B',
    number: 141,
    category: 'CROP_PROVIDER',
    desc: ['When you play this card, you can immediately exchange 0/1/3 <CLAY> for 1/2/3 <GRAIN>. This card is a <FIELD>.'],
    cost: {},
    players: '3+',
    isField: true,
    cardField: { allowedCrops: ['grain', 'vegetable', 'wood', 'stone'], capacity: 1 },
  },
  impl: cardImpl,
})

export const B141_FieldCaretaker_impl = B141_FieldCaretaker.impl
