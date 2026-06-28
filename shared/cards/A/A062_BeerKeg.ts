import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A062_BeerKeg'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, _player) => {

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { grain: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { grain: 3 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
        ],
      },
    ]

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A062_BeerKeg = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Beer Keg",
    deck: "A",
    number: 62,
    category: "FOOD_PROVIDER",
    desc: ["In the feeding phase of each harvest, you can use this card to exchange 1/2/3 <GRAIN> for 0/1/2 bonus <SCORE> and exactly 3 <FOOD>."],
    cost: { wood: 1 },
    prerequisite: "2 Grain in Your Supply",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A062_BeerKeg_impl = A062_BeerKeg.impl
