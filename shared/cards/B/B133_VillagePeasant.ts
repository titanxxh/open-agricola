import { defineOccupationCard } from '../card-source'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'B133_VillagePeasant'

const cardImpl = {
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

export const B133_VillagePeasant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Village Peasant',
    deck: 'B',
    number: 133,
    category: 'POINTS_PROVIDER',
    desc: ['At the start of scoring, you get a number of <VEGETABLE> equal to the smallest of the numbers of major improvements, minor improvements, and occupations you have.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B133_VillagePeasant_impl = B133_VillagePeasant.impl
