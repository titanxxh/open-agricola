import { Occupation } from '../types'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B149_OpenAirFarmer'

export const B149_OpenAirFarmer = new Occupation({
  id: CARD_ID,
  name: "Open Air Farmer",
  deck: "B",
  number: 149,
  category: "FARM_PLANNER",
  desc: ['When you play this card, you remove exactly 3 <STABLE> in your supply from play to build a pasture covering 2 farmyard spaces. You only need to pay a total of 2 <WOOD> for fences'],
  cost: {},
  players: "4+",
})

export const B149_OpenAirFarmer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq' as const,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { wood: 2 } }),
      {
        type: 'leaf' as const,
        actionId: 'fencing',
        sourceCard: CARD_ID,
      },
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
