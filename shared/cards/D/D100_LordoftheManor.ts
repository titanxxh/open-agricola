import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D100_LordoftheManor'

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

export const D100_LordoftheManor_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, _player, ctx) => {
    // 1 VP per standard category where score = 4 (max in standard range)
    const standardCategories = ['fields', 'pastures', 'grains', 'vegetables', 'sheeps', 'boars', 'cattles']
    return (ctx.categories ?? []).filter((cat) => standardCategories.includes(cat.key) && cat.total >= 4).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
