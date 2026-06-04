import { defineOccupationCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A118_Treegardener'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (_state, _player) => {

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
          { type: 'leaf', actionId: 'pay', params: { food: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { wood: 2 }, sourceCard: CARD_ID },
        ],
      },
    ]

    return {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID },
        {
          type: 'xor',
          optional: true,
          children,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A118_Treegardener = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Treegardener",
    deck: "A",
    number: 118,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["In the field phase of each harvest, you get 1 <WOOD> and you can buy up to 2 additional <WOOD> for 1 <FOOD> each."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A118_Treegardener_impl = A118_Treegardener.impl
