import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B149_OpenAirFarmer'

// BGA: pay 3 stables then take a fencing action at no fence cost.
// Simplified: pay 3 wood (stables supply proxy) then take fencing action.
// TODO: proper stable removal from supply (stables in supply are not tracked as resources).
registerCardEffect({
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
})

export const B149_OpenAirFarmer = new Occupation({
  id: CARD_ID,
  name: "Open Air Farmer",
  deck: "B",
  number: 149,
  category: "FARM_PLANNER",
  desc: ["When you play this card, you remove exactly 3 <STABLE> in your supply from play to build a pasture covering 2 farmyard spaces. You only need to pay a total of 2 <WOOD> for fences."],
  cost: {},
  players: "4+",
})
