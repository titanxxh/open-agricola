import { defineMinorCard } from '../card-source'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D079_CarrotMuseum'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterRoundEnd: (state, player) => {
    if (![8, 10, 12].includes(state.round)) return

    const vegFields = player.fields.filter(
      (f) => fieldHasCrop(f, 'vegetable'),
    ).length
    const veg = player.resources.vegetable ?? 0

    if (vegFields === 0 && veg === 0) return

    const gainParams: Record<string, number> = {}
    if (vegFields > 0) gainParams.stone = vegFields
    if (veg > 0) gainParams.wood = veg

    return {
      type: 'leaf',
      actionId: 'gain',
      params: gainParams,
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D079_CarrotMuseum = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Carrot Museum",
    deck: "D",
    number: 79,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["At the end of rounds 8, 10, and 12, you get 1 <STONE> for each <VEGETABLE> <FIELD> you have and a number of <WOOD> equal to the number of <VEGETABLE> in your supply."],
    vp: 2,
    cost: { wood: 1, clay: 2 },
    prerequisite: "Play in Round 8 or Before",
  },
  impl: cardImpl,
})

export const D079_CarrotMuseum_impl = D079_CarrotMuseum.impl
