import { MinorImprovement } from '../types'

const CARD_ID = 'E68_CherryOrchard'

export const E68_CherryOrchard = new MinorImprovement({
  id: CARD_ID,
  name: 'Cherry Orchard',
  deck: 'E',
  number: 68,
  category: 'CROPS_-_VEGETABLE',
  desc: [
    'This card is a field that can only grow <WOOD>. During each harvest, you receive 1 <WOOD> from this card. When you harvest the last <WOOD>, you also receive 1 <VEGETABLE>.',
  ],
  isField: true,
  cardField: { allowedCrops: ['wood'], capacity: 1 },
})
