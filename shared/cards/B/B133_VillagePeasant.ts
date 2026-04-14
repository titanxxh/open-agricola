import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B133_VillagePeasant'

// B133 Village Peasant: At the start of scoring, you get a number of vegetable equal to
// the smallest of the numbers of major improvements, minor improvements, and occupations you have.
// BGA: BeforeEndOfGame → gain vegetables that then score. Since each vegetable scores 1 VP,
// we use computePostScore to award the equivalent VP directly.
// Note: BGA's minor/major dual-type cards are handled optimally; we simplify to minors count.
registerCardEffect({
  id: CARD_ID,
  computePostScore: (_state, player, _categories) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const majors = player.improvements.length
    const minors = player.minorPlayed.length
    const occupations = player.occupationPlayed.length
    const n = Math.min(majors, minors, occupations)
    return Math.max(0, n)
  },
})

export const B133_VillagePeasant = new Occupation({
  id: CARD_ID,
  name: 'Village Peasant',
  deck: 'B',
  number: 133,
  category: 'POINTS_PROVIDER',
  desc: ['At the start of scoring, you get a number of <VEGETABLE> equal to the smallest of the numbers of major improvements, minor improvements, and occupations you have.'],
  cost: {},
  players: '3+',
  newSet: true,
})
