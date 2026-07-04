import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import {
  makeClearedSpaceTokenListener,
  makeFarmyardGoodsClaimListener,
} from './moor-farmyard-space-token'
import { allImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M092_AridField'

const cardImpl = {
  listeners: [
    makeClearedSpaceTokenListener({
      cardId: CARD_ID,
      listenerId: 'M092-arid-field-after-cut-peat',
      actions: ['cut-peat'],
      kind: 'farmyard-goods-token',
      resources: { fuel: 1, food: 1 },
    }),
    makeFarmyardGoodsClaimListener(CARD_ID),
  ],
  prerequisiteCheck: (player) => allImprovementCount(player) >= 3,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M092_AridField = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Arid Field",
    deck: "M",
    number: 92,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time you take the __Cut Peat__ special action, place 1 <FUEL> and 1 <FOOD> on the emptied farmyard space. This farmyard space is still considered unused. You get the goods once the farmyard space is no longer unused."
    ],
    cost: {},
    prerequisite: "3 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})
