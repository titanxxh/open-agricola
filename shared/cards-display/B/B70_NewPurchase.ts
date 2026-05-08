import { MinorImprovement } from '../types'

const CARD_ID = 'B70_NewPurchase'

export const B70_NewPurchase = new MinorImprovement({
  id: CARD_ID,
  name: "New Purchase",
  deck: "B",
  number: 70,
  category: "CROP_PROVIDER",
  desc: ['Before the start of each round that ends with a harvest, you can buy one of each of the following crops: 2 <FOOD> <ARROW> 1 <GRAIN>; 4 <FOOD> <ARROW> 1 <VEGETABLE>'],
  cost: {},
  players: "1+",
})
