import { defineOccupationCard } from '../card-source'
import { isMajorImprovementInFamily } from '../major/supply'
import type { CardImpl } from '../registry'

const CARD_ID = 'B101_FurnitureCarpenter'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (state, player) => {
    const anyPlayerHasJoinery = state.players.some(
      (p) => p.improvements.some((cardId) => isMajorImprovementInFamily(cardId, 'joinery')),
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
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B101_FurnitureCarpenter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Furniture Carpenter',
    deck: 'B',
    number: 101,
    category: 'POINTS_PROVIDER',
    desc: ['Each harvest, if any player (including you) owns the Joinery or an upgrade thereof, you can buy exactly 1 bonus <SCORE> for 2 <FOOD>.'],
    cost: {},
    players: '1+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const B101_FurnitureCarpenter_impl = B101_FurnitureCarpenter.impl
