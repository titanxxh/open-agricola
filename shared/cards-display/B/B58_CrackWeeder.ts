import { MinorImprovement } from '../types'

const CARD_ID = 'B58_CrackWeeder'

export const B58_CrackWeeder = new MinorImprovement({
  id: CARD_ID,
  name: 'Crack Weeder',
  deck: 'B',
  number: 58,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <FOOD>. For each <VEGETABLE> you take from a field in the field phase of a harvest, you also get 1 <FOOD>.',
  ],
  cost: { wood: 1 },
  newSet: true,
})
