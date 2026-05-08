import {
  getWorkPhaseBuildingResources,
} from '../../session/work-phase-resources'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { A53_Claypipe } from '../../cards-display/A/A53_Claypipe'

const CARD_ID = 'A53_Claypipe'

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
