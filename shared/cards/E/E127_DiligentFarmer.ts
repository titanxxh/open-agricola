import { Scoring } from '../../domain'
import type { CardImpl } from '../registry'
import { E127_DiligentFarmer } from '../../cards-display/E/E127_DiligentFarmer'

const CARD_ID = E127_DiligentFarmer.id

/**
 * E127 Diligent Farmer (Occupation, E, 127)
 * When you play this card, if you would score the maximum 4 points in 3 scoring
 * categories (including fenced stables), you can extend your house by 1 room
 * at no cost.
 *
 * BGA: onBuy computes scores, counts categories where score == 4
 * (fields, pastures, grains, vegetables, sheeps, pigs, cattles, stables).
 * If 3+ categories have max score, offer optional free room.
 *
 * Implementation: compute scores at buy time, check the 8 standard categories,
 * and if 3+ have score == 4, offer a free construct room.
 */

const MAX_SCORE_CATEGORIES = [
  'fields', 'pastures', 'grains', 'vegetables',
  'sheeps', 'boars', 'cattles', 'stables',
]
const FREE_SINGLE_ROOM_CONTEXT = {
  maxRooms: 1,
  exactCost: { max: 1 },
  trueAction: false,
  cancelPolicy: 'forbidCancel',
}

export const E127_DiligentFarmer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const scores = Scoring.computeAll(state)
    const playerScore = scores.find((s) => s.playerId === player.id)
    if (!playerScore) return

    let maxCount = 0
    for (const cat of playerScore.categories) {
      if (!MAX_SCORE_CATEGORIES.includes(cat.key)) continue
      if (cat.total >= 4) {
        maxCount += 1
      }
    }

    if (maxCount < 3) return

    // Offer an optional free room
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'construct',
          sourceCard: CARD_ID,
          actionContext: FREE_SINGLE_ROOM_CONTEXT,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
