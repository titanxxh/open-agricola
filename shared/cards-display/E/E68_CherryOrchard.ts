import { MinorImprovement } from '../types'

const CARD_ID = 'E68_CherryOrchard'

export const E68_CherryOrchard = new MinorImprovement({
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
})
