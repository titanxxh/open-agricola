import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B082_ValueAssets'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterHarvest: (_state, _player) => {

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: CARD_ID },
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

export const B082_ValueAssets = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Value Assets",
    deck: "B",
    number: 82,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["After each harvest, you can buy exactly one of the following goods: 1 <FOOD> <ARROW> 1 <WOOD>; 1 <FOOD> <ARROW> 1 <CLAY>; 2 <FOOD> <ARROW> 1 <REED>; 2 <FOOD> <ARROW> 1 <STONE>"],
    cost: {},
  },
  impl: cardImpl,
})

export const B082_ValueAssets_impl = B082_ValueAssets.impl
