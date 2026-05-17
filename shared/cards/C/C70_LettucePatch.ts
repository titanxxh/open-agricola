import { makeCardFieldImpl } from '../helpers/card-field'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { C70_LettucePatch } from '../../cards-display/C/C70_LettucePatch'

const CARD_ID = C70_LettucePatch.id

export const C70_LettucePatch_impl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['vegetable'], capacity: 1 },
  {
    onReap: () => ({
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { vegetable: 1 } }),
        gainLeaf(CARD_ID, { food: 4 }),
      ],
    }),
  },
)
