import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A064_BarleyMill'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    const grainFields = _state.harvestReapSummary?.[player.id]?.grainFields ?? 0
    if (grainFields <= 0) return
    return {
      type: 'seq',
      children: [gainLeaf(CARD_ID, { food: grainFields })],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A064_BarleyMill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Barley Mill",
    deck: "A",
    number: 64,
    category: "FOOD_PROVIDER",
    desc: ["In the field phase of each harvest, you get 1 <FOOD> for each <GRAIN> <FIELD> that you harvest."],
    vp: 1,
    altCosts: [{ wood: 1, clay: 4 }, { wood: 1, stone: 2 }],
  },
  impl: cardImpl,
})

export const A064_BarleyMill_impl = A064_BarleyMill.impl
