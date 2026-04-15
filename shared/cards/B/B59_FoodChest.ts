import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B59_FoodChest'

// BGA: 4 food if played on Major Improvement action space, otherwise 2 food.
// Simplified: always grant 2 food. TODO: detect action space context (onBuyWithData).
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 2 }),
})

export const B59_FoodChest = new MinorImprovement({
  id: CARD_ID,
  name: 'Food Chest',
  deck: 'B',
  number: 59,
  category: 'FOOD_MISC',
  desc: ['If you play this card on the __Major Improvement__ action space, you immediately get 4 <FOOD>. Otherwise, you get only 2 <FOOD>.'],
  cost: { wood: 1 },
})
