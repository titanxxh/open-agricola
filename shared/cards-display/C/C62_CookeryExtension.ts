import { MinorImprovement } from '../types'

const CARD_ID = 'C62_CookeryExtension'

export const C62_CookeryExtension = new MinorImprovement({
  id: CARD_ID,
  name: 'Cookery Extension',
  deck: 'C',
  number: 62,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each harvest, you can use each of your cooking improvements once to get double the amount of <FOOD> for 1 animal or <VEGETABLE>.',
  ],
  cost: { clay: 2 },
  implemented: true,
})
