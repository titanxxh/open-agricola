import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { buildFarmyardExtensionSelectionFlow } from './moor-farmyard-extension'

const CARD_ID = 'M050_FarmExtension'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => buildFarmyardExtensionSelectionFlow(CARD_ID, player),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M050_FarmExtension = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farm Extension",
    deck: "M",
    number: 50,
    category: "FARM_PLANNER",
    desc: [
        "Place a farmyard extension at one of the four sides of your farmyard board. Both new farmyard spaces must be adjacent to existing farmyard spaces."
    ],
    cost: {
        "clay": 1
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M050_FarmExtension_impl = M050_FarmExtension.impl
