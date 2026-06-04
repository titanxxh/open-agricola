import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B59_FoodChest'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B59_FoodChest = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Food Chest',
    deck: 'B',
    number: 59,
    category: 'FOOD_PROVIDER',
    desc: ['If you play this card on the __Major Improvement__ action space, you immediately get 4 <FOOD>. Otherwise, you get only 2 <FOOD>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const B59_FoodChest_impl = B59_FoodChest.impl
