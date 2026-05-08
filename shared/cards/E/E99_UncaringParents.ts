import type { CardImpl } from '../registry'
import { E99_UncaringParents } from '../../cards-display/E/E99_UncaringParents'
export { E99_UncaringParents }

const CARD_ID = E99_UncaringParents.id

export const E99_UncaringParents_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (_state, player) => {
    if (player.houseType !== 'stone') return

    return {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
