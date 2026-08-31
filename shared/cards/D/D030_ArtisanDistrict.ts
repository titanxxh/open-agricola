import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { isBottomRowMajorImprovement } from '../major/supply'

const CARD_ID = 'D030_ArtisanDistrict'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const count = player.improvements.filter(isBottomRowMajorImprovement).length
    if (count >= 5) return 8
    if (count >= 4) return 5
    if (count >= 3) return 2
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D030_ArtisanDistrict = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Artisan District",
    deck: "D",
    number: 30,
    category: "POINTS_PROVIDER",
    desc: ['During scoring, you get 2/5/8 bonus <SCORE> for having 3/4/5 major improvements from the bottom row of the supply board.'],
    cost: { stone: 1 },
    vp: 1,
    prerequisite: '3 Occupations',
    extraVp: true,
  },
  impl: cardImpl,
})

export const D030_ArtisanDistrict_impl = D030_ArtisanDistrict.impl
