import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D100_LordoftheManor'

registerCardEffect({
  id: CARD_ID,
  computePostScore: (_state, player, categories) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    // 1 VP per standard category where score = 4 (max in standard range)
    const standardCategories = ['fields', 'pastures', 'grains', 'vegetables', 'sheeps', 'boars', 'cattles']
    return categories.filter((cat) => standardCategories.includes(cat.key) && cat.total >= 4).length
  },
})

export const D100_LordoftheManor = new Occupation({
  id: CARD_ID,
  name: "Lord of the Manor",
  deck: "D",
  number: 100,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each scoring category in which you score the maximum 4 points. (The bonus point is also awarded for 4 fenced stables.)"],
  cost: {},
  players: "1+",
  newSet: true,
})
