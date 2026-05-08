import { MinorImprovement } from '../types'

const CARD_ID = 'C57_Crudite'

export const C57_Crudite = new MinorImprovement({
  id: CARD_ID,
  name: 'Crudite',
  deck: 'C',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you can immediately buy exactly 1 <VEGETABLE> for 3 <FOOD>. At any time, you can discard 1 <VEGETABLE> on top of another <VEGETABLE> in a field to get 4 <FOOD>.',
  ],
  cost: {},
  evenMoreSet: true,
})
