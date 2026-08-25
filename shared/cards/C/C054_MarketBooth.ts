import { defineMinorCard } from '../card-source'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C054_MarketBooth'

const cardImpl = {
  effect: {
    id: CARD_ID,
    preHarvestGoodsWanted: ['grain'],
    onEndHarvestFieldPhase: () => payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1, fence: 1 },
      gain: { food: 5 },
    }).flow,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C054_MarketBooth = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Market Booth",
    deck: "C",
    number: 54,
    category: "FOOD_PROVIDER",
    desc: ["After the field phase of each harvest, you can exchange 1 <GRAIN> plus 1 <FENCE> (both from your supply) for 5 <FOOD>."],
    cost: { stable: 1 },
  },
  impl: cardImpl,
})

export const C054_MarketBooth_impl = C054_MarketBooth.impl
