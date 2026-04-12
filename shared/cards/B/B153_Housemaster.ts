import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B153_Housemaster'

registerCardEffect({
  id: CARD_ID,
  computePostScore: (_state, player, categories) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const cardsCat = categories.find((c) => c.key === 'cards')
    const bonusCat = categories.find((c) => c.key === 'cardsBonus')
    const majorVp = (cardsCat?.entries ?? [])
      .filter((e) => e.type === 'card' && e.cardType === 'major')
      .reduce((sum, e) => sum + e.score, 0)
    const majorBonusVp = (bonusCat?.total ?? 0)
    const total = majorVp + majorBonusVp
    if (total >= 11) return 4
    if (total >= 9) return 3
    if (total >= 7) return 2
    if (total >= 5) return 1
    return 0
  },
})

export const B153_Housemaster = new Occupation({
  id: CARD_ID,
  name: "Housemaster",
  deck: "B",
  number: 153,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1/2/3/4 bonus <SCORE> if you score at least 5/7/9/11 <SCORE> from Major Improvements."],
  cost: {},
  players: "1+",
})
