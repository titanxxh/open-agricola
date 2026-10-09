import { defineMinorCard } from '../card-source'
import { paymentPathOnBuy } from '../../actions/purchase-outcome'
import type { CardImpl } from '../registry'

const CARD_ID = 'B065_GrainDepot'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: paymentPathOnBuy(CARD_ID, [2, 3, 4].map((count) => ({ kind: 'future-prefix', offset: 1, count, resources: { grain: 1 } }))),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B065_GrainDepot = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Grain Depot",
    deck: "B",
    number: 65,
    category: "CROP_PROVIDER",
    desc: ["If you paid <WOOD>/<CLAY>/<STONE> for this card, place 1 <GRAIN> on each of the next 2/3/4 round spaces. At the start of these rounds, you get the <GRAIN>."],
    cost: {},
    altCosts: [{ wood: 2 }, { clay: 2 }, { stone: 2 }],
  },
  impl: cardImpl,
})

export const B065_GrainDepot_impl = B065_GrainDepot.impl
