import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B7_Wage'

// BGA: 2 food + 1 food per bottom-row major improvement (ClayOven, StoneOven, Joinery, Pottery, Basket)
const BOTTOM_ROW_MAJORS = ['Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket']

export const B7_Wage = new MinorImprovement({
  id: CARD_ID,
  name: "Wage",
  deck: "B",
  number: 7,
  category: "FOOD_MISC",
  desc: ["You immediately get 2 <FOOD> and 1 additional <FOOD> for each major improvement you have from the bottom row of the supply board."],
  cost: { food: 1 },
  passing: true,
})

export const B7_Wage_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const bonus = player.improvements.filter((id) => BOTTOM_ROW_MAJORS.includes(id)).length
    return gainLeaf(CARD_ID, { food: 2 + bonus })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
