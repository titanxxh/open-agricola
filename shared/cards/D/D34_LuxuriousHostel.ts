import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D34_LuxuriousHostel'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return player.houseType === 'stone' && player.rooms > player.familySize ? 4 : 0
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
  cost: { stone: 1, food: 3 },
  prerequisite: "Stone House",
})
