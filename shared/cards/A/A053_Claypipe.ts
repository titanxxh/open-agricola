import { defineMinorCard } from '../card-source'
import {
  getWorkPhaseBuildingResources,
} from '../../session/work-phase-resources'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A053_Claypipe'

const cardImpl = {
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

export const A053_Claypipe = defineMinorCard({
  meta: {
    id: "A053_Claypipe",
    name: "Claypipe",
    deck: "A",
    number: 53,
    category: "FOOD_PROVIDER",
    desc: ["In the returning home phase of each round, if you gained at least 7 building resources in the preceding work phase, you get 2 <FOOD>."],
    cost: {"clay":1},
  },
  impl: cardImpl,
})

export const A053_Claypipe_impl = A053_Claypipe.impl
