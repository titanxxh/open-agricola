import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B101_FurnitureCarpenter'

/**
 * B101 Furniture Carpenter — Each harvest, if any player (including you) owns
 * the Joinery or an upgrade thereof, you can buy exactly 1 bonus <SCORE> for 2 <FOOD>.
 *
 * BGA: getExchanges() dynamically checks if any player has Major_Joinery.
 * Exchange: {FOOD=>2, max:1} → {SCORE:1} during harvest.
 *
 * Implementation: onHarvestFieldPhase (after field phase = typical exchange window).
 * Check if any player has Major_Joinery in their improvements.
 * If so, offer the optional exchange.
 * Players: 1+.
 */
registerCardEffect({
  id: CARD_ID,
  onHarvestFieldPhase: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

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
