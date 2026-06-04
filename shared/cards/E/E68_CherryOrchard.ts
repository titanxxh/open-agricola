import { defineMinorCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E68_CherryOrchard'

const cardImpl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['wood'], capacity: 1 },
  {
    onReap: ({ isLast }) => {
      if (!isLast) return
      return gainLeaf(CARD_ID, { vegetable: 1 })
    },
  },
)

export const E68_CherryOrchard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Cherry Orchard',
    deck: 'E',
    number: 68,
    category: 'CROPS_-_VEGETABLE',
    desc: [
        'This card is a field on which you can only sow and harvest <WOOD> as you would <GRAIN>. Each time you harvest the last <WOOD> from this card, you also receive 1 <VEGETABLE>.',
      ],
    isField: true,
    cardField: { allowedCrops: ['wood'], capacity: 1 },
  },
  impl: cardImpl,
})

export const E68_CherryOrchard_impl = E68_CherryOrchard.impl
