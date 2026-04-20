import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E58_LunchtimeBeer'

export const E58_LunchtimeBeer = new MinorImprovement({
  id: CARD_ID,
  name: 'Lunchtime Beer',
  deck: 'E',
  number: 58,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each harvest, you can choose to skip the field and breeding phase of that harvest and get exactly 1 <FOOD> instead.'],
  cost: {},
})

export const E58_LunchtimeBeer_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, _player) => {
    return {
      type: 'seq',
      optional: true,
      children: [gainLeaf(CARD_ID, { food: 1 })],
    }
    // TODO: should skip field+breeding phases when used
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
