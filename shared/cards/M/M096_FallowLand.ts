import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import {
  makeClearedSpaceTokenListener,
  makeFarmyardGoodsClaimListener,
} from './moor-farmyard-space-token'
import { allImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M096_FallowLand'

const cardImpl = {
  listeners: [
    makeClearedSpaceTokenListener({
      cardId: CARD_ID,
      listenerId: 'M096-fallow-land-after-cut-peat-or-fell-trees',
      actions: ['cut-peat', 'fell-trees'],
      kind: 'farmyard-goods-token',
      resources: { food: 1 },
    }),
    makeFarmyardGoodsClaimListener(CARD_ID),
  ],
  prerequisiteCheck: (player) => allImprovementCount(player) >= 2,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M096_FallowLand = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fallow Land",
    deck: "M",
    number: 96,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time you take the \"Fell Trees\" or \"Cut Peat\" special action, place 1 food on the emptied farmyard space. This farmyard space is still considered unused. Once the farmyard space is no longer unused, you get the food."
    ],
    cost: {},
    prerequisite: "2 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})
