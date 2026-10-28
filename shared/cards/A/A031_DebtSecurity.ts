import { defineMinorCard } from '../card-source'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import { countUnusedFarmyardSpaces } from '../../domain/farmyard-usage'
import { countsForMoorBalanceRules } from '../helpers/moor-balance'

const CARD_ID = 'A031_DebtSecurity'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    const unusedSpaces = countUnusedFarmyardSpaces(player)
    const majors = collectCardsAs(player, 'major').filter(cardId => countsForMoorBalanceRules(state, cardId))
    return Math.min(majors.length, unusedSpaces)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A031_DebtSecurity = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Debt Security",
    deck: "A",
    number: 31,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each major improvement you have, up to the number of your unused farmyard spaces."],
    cost: { food: 2 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const A031_DebtSecurity_impl = A031_DebtSecurity.impl
