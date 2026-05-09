import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C34_ElephantgrassPlant } from '../../cards-display/C/C34_ElephantgrassPlant'

const CARD_ID = C34_ElephantgrassPlant.id

export const C34_ElephantgrassPlant_impl = {
  effect: {
  id: CARD_ID,
  onAfterHarvest: (_state, player) => {
    if (player.resources.reed < 1) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { reed: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    } satisfies ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
