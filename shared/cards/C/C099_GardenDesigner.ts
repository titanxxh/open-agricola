import { defineOccupationCard } from '../card-source'
import { getLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'
import { paretoOptimal } from '../helpers/pareto-bonus'

const CARD_ID = 'C099_GardenDesigner'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeCostedBonus: (_state, player, _ctx) => {
      const emptyFields = getLogicalFields(player).filter((field) => field.stacks.length === 0).length
      if (emptyFields === 0) return [{ cost: {}, score: 0 }]
      const food = player.resources.food ?? 0
      const raw: BonusScoreLevel[] = []
      for (let n7 = 0; n7 <= emptyFields; n7++) {
        for (let n4 = 0; n4 + n7 <= emptyFields; n4++) {
          for (let n1 = 0; n1 + n4 + n7 <= emptyFields; n1++) {
            const foodCost = 7 * n7 + 4 * n4 + 1 * n1
            if (foodCost > food) continue
            const score = 3 * n7 + 2 * n4 + 1 * n1
            raw.push({ cost: foodCost === 0 ? {} : { food: foodCost }, score })
          }
        }
      }
      return paretoOptimal(raw)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C099_GardenDesigner = defineOccupationCard({
  meta: {
    id: "C099_GardenDesigner",
    name: "Garden Designer",
    deck: "C",
    number: 99,
    category: "POINTS_PROVIDER",
    desc: ["At the start of scoring, you can place <FOOD> in empty <FIELD>. You get 1/2/3 bonus <SCORE> for each <FIELD> in which you place 1/4/7 <FOOD>."],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const C099_GardenDesigner_impl = C099_GardenDesigner.impl
