import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D30_ArtisanDistrict'
const BOTTOM_ROW_MAJORS = new Set([
  'Major_ClayOven',
  'Major_StoneOven',
  'Major_Joinery',
  'Major_Pottery',
  'Major_Basket',
])

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const count = player.improvements.filter((id) => BOTTOM_ROW_MAJORS.has(id)).length
    if (count >= 5) return 8
    if (count >= 4) return 5
    if (count >= 3) return 2
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D30_ArtisanDistrict = defineMinorCard({
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

export const D30_ArtisanDistrict_impl = D30_ArtisanDistrict.impl
