import { MinorImprovement } from '../types'

const CARD_ID = 'B59_FoodChest'

export const B59_FoodChest = new MinorImprovement({
  id: CARD_ID,
  name: 'Food Chest',
  deck: 'B',
  number: 59,
  category: 'FOOD_PROVIDER',
  desc: ['If you play this card on the __Major Improvement__ action space, you immediately get 4 <FOOD>. Otherwise, you get only 2 <FOOD>.'],
  cost: { wood: 1 },
})
