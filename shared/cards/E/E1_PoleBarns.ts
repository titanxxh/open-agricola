import type { CardImpl } from '../registry'
import { E1_PoleBarns } from '../../cards-display/E/E1_PoleBarns'

const CARD_ID = E1_PoleBarns.id

export const E1_PoleBarns_impl = {
  prerequisiteCheck: (player) => player.fenceSegments.length >= 15,
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'stables',
    sourceCard: CARD_ID,
    optional: true,
    params: { max: 3, freeCost: true },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
