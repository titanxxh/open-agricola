import type { CardImpl } from '../registry'
import { C107_Baker } from '../../cards-display/C/C107_Baker'

const CARD_ID = C107_Baker.id

export const C107_Baker_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (player.resources.grain < 1) return
    return {
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
  onStartHarvestFeedingPhase: (_state, player) => {
    if (player.resources.grain < 1) return
    return {
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
