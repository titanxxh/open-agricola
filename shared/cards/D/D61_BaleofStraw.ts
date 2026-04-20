import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D61_BaleofStraw'

export const D61_BaleofStraw = new MinorImprovement({
  id: CARD_ID,
  name: "Bale of Straw",
  deck: "D",
  number: 61,
  category: "FOOD_PROVIDER",
  desc: ["At the start of each harvest, if you have at least 3 grain fields (including field cards with planted grain), you get 2 <FOOD>."],
  cost: {},
})

export const D61_BaleofStraw_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, player) => {

    // Count grain fields (fields with grain crop planted)
    const grainFieldCount = player.fields.filter(
      (f) => fieldHasCrop(f, 'grain'),
    ).length
    if (grainFieldCount < 3) return

    return gainLeaf(CARD_ID, { food: 2 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
