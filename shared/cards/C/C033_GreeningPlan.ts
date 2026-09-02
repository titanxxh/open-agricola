import { defineMinorCard } from '../card-source'
import { getLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C033_GreeningPlan'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const emptyFields = getLogicalFields(player).filter((field) => field.stacks.length === 0).length
    if (emptyFields >= 6) return 5
    if (emptyFields >= 5) return 3
    if (emptyFields >= 4) return 2
    if (emptyFields >= 2) return 1
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C033_GreeningPlan = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Greening Plan",
    deck: "C",
    number: 33,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, if you then have at least 2/4/5/6 unplanted <FIELD>, you get 1/2/3/5 bonus <SCORE>."],
    cost: { food: 3 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const C033_GreeningPlan_impl = C033_GreeningPlan.impl
