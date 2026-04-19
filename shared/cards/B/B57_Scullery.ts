import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B57_Scullery'

// B57 Scullery: At the start of each round, if you live in a wooden house, you get 1 food.
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'wood') return
    return gainLeaf(CARD_ID, { food: 1 })
  },
})

export const B57_Scullery = new MinorImprovement({
  id: CARD_ID,
  name: 'Scullery',
  deck: 'B',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each round, if you live in a wooden house, you get 1 <FOOD>.'],
  cost: { wood: 1, clay: 1 },
})
