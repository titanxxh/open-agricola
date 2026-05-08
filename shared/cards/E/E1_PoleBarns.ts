import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { E1_PoleBarns } from '../../cards-display/E/E1_PoleBarns'
export { E1_PoleBarns }

const CARD_ID = E1_PoleBarns.id

registerPrerequisite('15 Fences Built', (player) => player.fenceSegments.length >= 15)

export const E1_PoleBarns_impl = {
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
