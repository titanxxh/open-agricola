import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { computeScores } from '../../logic/scoring'

const CARD_ID = 'E127_DiligentFarmer'

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
 * and if 3+ have score == 4, offer a free room via build-farmhand-room.
 */

const MAX_SCORE_CATEGORIES = [
  'fields', 'pastures', 'grains', 'vegetables',
  'sheeps', 'boars', 'cattles', 'stables',
]

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const scores = computeScores(state)
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
          actionId: 'build-farmhand-room',
          sourceCard: CARD_ID,
        },
      ],
    }
  },
})

export const E127_DiligentFarmer = new Occupation({
  id: CARD_ID,
  name: 'Diligent Farmer',
  deck: 'E',
  number: 127,
  category: 'FARM_BUILDER',
  desc: ['When you play this card, if you would score the maximum 4 points in 3 scoring categories (including fenced stables), you can extend your house by 1 room at no cost.'],
  players: '3+',
})
