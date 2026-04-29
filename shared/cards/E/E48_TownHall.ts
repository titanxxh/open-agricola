import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E48_TownHall'

export const E48_TownHall = new MinorImprovement({
  id: CARD_ID,
  name: "Town Hall",
  deck: "E",
  number: 48,
  category: "FOOD",
  desc: ["In the feeding phase of each harvest, if you live in a clay or stone house, you get 1 or 2 <FOOD>, respectively."],
  vp: 2,
  cost: { wood: 2, clay: 2 },
})

export const E48_TownHall_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {

    if (player.houseType === 'clay') {
      return gainLeaf(CARD_ID, { food: 1 })
    }
    if (player.houseType === 'stone') {
      return gainLeaf(CARD_ID, { food: 2 })
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
