import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isBottomRowMajorImprovement } from '../major/supply'

const CARD_ID = 'B007_Wage'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const bonus = player.improvements.filter(isBottomRowMajorImprovement).length
    return gainLeaf(CARD_ID, { food: 2 + bonus })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B007_Wage = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wage",
    deck: "B",
    number: 7,
    category: "FOOD_PROVIDER",
    desc: ["You immediately get 2 <FOOD> and 1 additional <FOOD> for each major improvement you have from the bottom row of the supply board."],
    passing: true,
  },
  impl: cardImpl,
})

export const B007_Wage_impl = B007_Wage.impl
