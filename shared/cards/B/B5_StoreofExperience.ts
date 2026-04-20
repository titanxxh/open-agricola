import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B5_StoreofExperience'

// rewards[0..4] => stone, [5] => reed, [6] => clay, [7] => wood
const REWARDS: (keyof Resource)[] = ['stone', 'stone', 'stone', 'stone', 'stone', 'reed', 'clay', 'wood']

export const B5_StoreofExperience = new MinorImprovement({
  id: CARD_ID,
  name: "Store of Experience",
  deck: "B",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["If you have 0-4/5/6/7 occupations left in hand, you immediately get 1 <STONE>/<REED>/<CLAY>/<WOOD>."],
  cost: { food: 1 },
  passing: true,
})

export const B5_StoreofExperience_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const occsInHand = player.occupationHand.length
    const resource = REWARDS[Math.min(occsInHand, 7)]
    if (!resource) return
    return gainLeaf(CARD_ID, { [resource]: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
