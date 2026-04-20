import { MinorImprovement } from '../types'
import {
  getWorkPhaseBuildingResources,
} from '../../logic/work-phase-resources'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A53_Claypipe'

export const A53_Claypipe = new MinorImprovement({
  id: "A53_Claypipe",
  name: "Claypipe",
  deck: "A",
  number: 53,
  category: "FOOD_PROVIDER",
  desc: ["In the returning home phase of each round, if you gained at least 7 building resources in the preceding work phase, you get 2 <FOOD>."],
  cost: {"clay":1},
})

export const A53_Claypipe_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const totalBuilding = getWorkPhaseBuildingResources(state, player.id)
    writeCardInfobox(player, CARD_ID, `${totalBuilding} / 7`)
  },
  onReturnHome: (state, player) => {
    const totalBuilding = getWorkPhaseBuildingResources(state, player.id)
    writeCardInfobox(player, CARD_ID, '0 / 7')
    if (totalBuilding < 7) return
    return {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
