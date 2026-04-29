import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B4_WoodPile'

export const B4_WoodPile = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Pile",
  deck: "B",
  number: 4,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get a number of <WOOD> equal to the number of people you have on accumulation spaces."],
  cost: {},
  passing: true,
})

export const B4_WoodPile_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 3 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
