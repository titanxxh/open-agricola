import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C66_EternalRyeCultivation } from '../../cards-display/C/C66_EternalRyeCultivation'

const CARD_ID = C66_EternalRyeCultivation.id

export const C66_EternalRyeCultivation_impl = {
  effect: {
  id: CARD_ID,
  onAfterHarvest: (_state, player) => {

    const grain = player.resources.grain
    let flow: ActionFlow | null = null

    if (grain >= 3) {
      flow = {
        type: 'leaf',
        actionId: 'gain',
        params: { grain: 1 },
        sourceCard: CARD_ID,
      }
    } else if (grain === 2) {
      flow = {
        type: 'leaf',
        actionId: 'gain',
        params: { food: 1 },
        sourceCard: CARD_ID,
      }
    }

    return flow ?? undefined
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
