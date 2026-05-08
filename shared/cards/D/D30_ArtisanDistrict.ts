import type { CardImpl } from '../registry'
import { D30_ArtisanDistrict } from '../../cards-display/D/D30_ArtisanDistrict'
export { D30_ArtisanDistrict }

const CARD_ID = D30_ArtisanDistrict.id

const BOTTOM_ROW_MAJORS = new Set([
  'Major_ClayOven',
  'Major_StoneOven',
  'Major_Joinery',
  'Major_Pottery',
  'Major_Basket',
])

export const D30_ArtisanDistrict_impl = {
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
