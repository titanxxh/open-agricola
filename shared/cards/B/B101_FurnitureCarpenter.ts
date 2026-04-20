import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B101_FurnitureCarpenter'

export const B101_FurnitureCarpenter = new Occupation({
  id: CARD_ID,
  name: 'Furniture Carpenter',
  deck: 'B',
  number: 101,
  category: 'POINTS_PROVIDER',
  desc: ['Each harvest, if any player (including you) owns the Joinery or an upgrade thereof, you can buy exactly 1 bonus <SCORE> for 2 <FOOD>.'],
  cost: {},
  players: '1+',
})

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
            { type: 'leaf' as const, actionId: 'pay-resources', params: { food: 2 }, sourceCard: CARD_ID },
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
