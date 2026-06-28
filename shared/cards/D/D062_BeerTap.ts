import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D062_BeerTap'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D062_BeerTap = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Beer Tap',
    deck: 'D',
    number: 62,
    category: 'FOOD_PROVIDER',
    desc: ['When you play this card, you immediately get 2 <FOOD>. In the feeding phase of each harvest, you can turn 2/3/4 <GRAIN> into 3/6/9 <FOOD>.'],
    cost: { wood: 1 },
    exchanges: [
        { from: { grain: 2 }, to: { food: 3 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
        { from: { grain: 3 }, to: { food: 6 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
        { from: { grain: 4 }, to: { food: 9 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
      ],
  },
  impl: cardImpl,
})

export const D062_BeerTap_impl = D062_BeerTap.impl
