import type { CardImpl } from '../registry'
import { B101_FurnitureCarpenter } from '../../cards-display/B/B101_FurnitureCarpenter'
export { B101_FurnitureCarpenter }

const CARD_ID = B101_FurnitureCarpenter.id

export const B101_FurnitureCarpenter_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (state, player) => {
    // Check if any player has built Major_Joinery
    const anyPlayerHasJoinery = state.players.some(
      (p) => p.improvements?.includes('Major_Joinery'),
    )
    if (!anyPlayerHasJoinery) return
    if ((player.resources.food ?? 0) < 2) return
    return {
      type: 'xor' as const,
      optional: true,
      children: [
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay', params: { food: 2 }, sourceCard: CARD_ID },
            { type: 'leaf' as const, actionId: 'bonus-vp', sourceCard: CARD_ID },
          ],
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesPaid: { food: 2 }, bonusVp: 1 },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
