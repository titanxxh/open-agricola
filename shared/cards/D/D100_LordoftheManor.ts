import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D100_LordoftheManor'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, _player, ctx) => {
    // 1 VP per standard category where score = 4 (max in standard range)
    // BGA whitelist (`computeSpecialScore`): fields, pastures, grains,
    // vegetables, sheeps, pigs, cattles, stables. Card desc explicitly: "The
    // bonus point is also awarded for 4 fenced stables."
    const standardCategories = ['fields', 'pastures', 'grains', 'vegetables', 'sheeps', 'boars', 'cattles', 'stables']
    return (ctx.categories ?? []).filter((cat) => standardCategories.includes(cat.key) && cat.total >= 4).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D100_LordoftheManor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Lord of the Manor",
    deck: "D",
    number: 100,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each scoring category in which you score the maximum 4 points. (The bonus point is also awarded for 4 fenced stables.)"],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const D100_LordoftheManor_impl = D100_LordoftheManor.impl
