import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'
import { paretoOptimal } from '../helpers/pareto-bonus'
import { C99_GardenDesigner } from '../../cards-display/C/C99_GardenDesigner'

const CARD_ID = 'C99_GardenDesigner'

export const C99_GardenDesigner_impl = {
  effect: {
    id: CARD_ID,
    computeCostedBonus: (_state, player, _ctx) => {
      const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
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
