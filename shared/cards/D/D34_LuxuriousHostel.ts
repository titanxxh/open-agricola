import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { getStoneHouseBonusScore } from '../helpers/stone-house-bonus'

const CARD_ID = 'D34_LuxuriousHostel'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return getStoneHouseBonusScore(player, CARD_ID)
  },
})

export const D34_LuxuriousHostel = new MinorImprovement({
  id: CARD_ID,
  name: "Luxurious Hostel",
  deck: "D",
  number: 34,
  category: "POINTS_PROVIDER",
  desc: [
    'During scoring, if you then have more stone rooms than people, you get 4 bonus <SCORE>. You can only use one card to get bonus points for your stone house.',
  ],
  cost: { wood: 1, clay: 2 },
  extraVp: true,
  newSet: true,
})
