import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B59_FoodChest } from '../../cards-display/B/B59_FoodChest'

const CARD_ID = B59_FoodChest.id

export const B59_FoodChest_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
