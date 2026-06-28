import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C055_Studio'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, _player) => {

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { wood: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { clay: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { stone: 1 }, sourceCard: CARD_ID },
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

export const C055_Studio = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Studio",
    deck: "C",
    number: 55,
    category: "FOOD_PROVIDER",
    desc: ["In the feeding phase of each harvest, you can use this card to turn exactly 1 <WOOD>/<CLAY>/<STONE> into 2/2/3 <FOOD>."],
    vp: 1,
    cost: { clay: 1, reed: 1 },
    waresSalesmanGains: [{ wood: 1, reed: 1 }, { clay: 1, reed: 1 }, { stone: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const C055_Studio_impl = C055_Studio.impl
