import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B57_Scullery'

export const B57_Scullery = new MinorImprovement({
  id: CARD_ID,
  name: 'Scullery',
  deck: 'B',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each round, if you live in a wooden house, you get 1 <FOOD>.'],
  cost: { wood: 1, clay: 1 },
})

export const B57_Scullery_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'wood') return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
