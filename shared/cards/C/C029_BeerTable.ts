import { defineMinorCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C029_BeerTable'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFieldPhase: (_state, player) => {
    if ((player.resources.grain ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { recipientMode: 'others', food: 1 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C029_BeerTable = defineMinorCard({
  meta: {
    id: "C029_BeerTable",
    name: "Beer Table",
    deck: "C",
    number: 29,
    category: "POINTS_PROVIDER",
    desc: ["At the end of the field phase of each harvest, you can pay 1 <GRAIN> from your supply to get 2 bonus <SCORE>. If you do, all other players get 1 <FOOD> each."],
    cost: {"wood":2},
    prerequisite: "No Grain in Your Supply",
    extraVp: true,
  },
  impl: cardImpl,
})

export const C029_BeerTable_impl = C029_BeerTable.impl
