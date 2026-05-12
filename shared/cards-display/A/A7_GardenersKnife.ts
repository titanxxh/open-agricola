import { MinorImprovement } from '../types'

const CARD_ID = 'A7_GardenersKnife'

export const A7_GardenersKnife = new MinorImprovement({
  id: CARD_ID,
  name: "Gardener's Knife",
  deck: 'A',
  number: 7,
  category: 'FOOD_PROVIDER',
  desc: ['You immediately get 1 <FOOD> for each grain field you have and 1 <GRAIN> for each vegetable field you have.'],
  cost: { wood: 1 },
  passing: true,
})
