import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import { B133_VillagePeasant } from '../../cards-display/B/B133_VillagePeasant'

const CARD_ID = B133_VillagePeasant.id

export const B133_VillagePeasant_impl = {
  effect: {
  id: CARD_ID,
  onBeforeEndGame: (_state, player) => {
    const majors = collectCardsAs(player, 'major').length
    const minors = player.minorPlayed.length
    const occupations = player.occupationPlayed.length
    const n = Math.min(majors, minors, occupations)
    if (n > 0) {
      player.resources.vegetable += n
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
