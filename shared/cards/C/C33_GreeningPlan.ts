import { MinorImprovement } from '../types'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C33_GreeningPlan'

export const C33_GreeningPlan = new MinorImprovement({
  id: CARD_ID,
  name: "Greening Plan",
  deck: "C",
  number: 33,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you then have at least 2/4/5/6 unplanted fields, you get 1/2/3/5 bonus <SCORE>."],
  cost: { food: 3 },
})

export const C33_GreeningPlan_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
    if (emptyFields >= 6) return 5
    if (emptyFields >= 5) return 3
    if (emptyFields >= 4) return 2
    if (emptyFields >= 2) return 1
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
