import type { CardImpl } from '../registry'
import { D100_LordoftheManor } from '../../cards-display/D/D100_LordoftheManor'
export { D100_LordoftheManor }

const CARD_ID = D100_LordoftheManor.id

export const D100_LordoftheManor_impl = {
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
