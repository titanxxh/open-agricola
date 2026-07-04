import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D061_BaleofStraw'

const cardImpl = {
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

export const D061_BaleofStraw = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Bale of Straw",
    deck: "D",
    number: 61,
    category: "FOOD_PROVIDER",
    desc: ["At the start of each harvest, if you have at least 3 <GRAIN> <FIELD> (including <FIELD> cards with planted <GRAIN>), you get 2 <FOOD>."],
    cost: {},
  },
  impl: cardImpl,
})

export const D061_BaleofStraw_impl = D061_BaleofStraw.impl
