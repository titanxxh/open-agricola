import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldTotalRemaining } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A64_BarleyMill'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    const grainFields = _state.harvestReapSummary?.[player.id]?.grainFields
      ?? player.fields.filter(
        (field) => fieldHasCrop(field, 'grain') && fieldTotalRemaining(field) > 0,
      ).length
    if (grainFields <= 0) return
    return {
      type: 'seq',
      children: [gainLeaf(CARD_ID, { food: grainFields })],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A64_BarleyMill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Barley Mill",
    deck: "A",
    number: 64,
    category: "FOOD_PROVIDER",
    desc: ["In the field phase of each harvest, you get 1 <FOOD> for each grain field that you harvest."],
    vp: 1,
    altCosts: [{ clay: 4 }, { stone: 2 }],
  },
  impl: cardImpl,
})

export const A64_BarleyMill_impl = A64_BarleyMill.impl
