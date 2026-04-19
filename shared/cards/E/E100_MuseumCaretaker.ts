import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E100_MuseumCaretaker'

// E100 Museum Caretaker: At the start of each work phase, if you have at least 1 wood,
// 1 clay, 1 reed, 1 stone, 1 grain, and 1 vegetable in your supply, you get 1 bonus VP.
// BGA: startOfWork → we use onRoundStart
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const r = player.resources
    if (
      (r.wood ?? 0) >= 1 &&
      (r.clay ?? 0) >= 1 &&
      (r.reed ?? 0) >= 1 &&
      (r.stone ?? 0) >= 1 &&
      (r.grain ?? 0) >= 1 &&
      (r.vegetable ?? 0) >= 1
    ) {
      return { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID }
    }
  },
})

export const E100_MuseumCaretaker = new Occupation({
  id: CARD_ID,
  name: 'Museum Caretaker',
  deck: 'E',
  number: 100,
  category: 'BONUS_POINTS_GET',
  desc: ['At the start of each work phase, if you have at least 1 <WOOD>, 1 <CLAY>, 1\u00a0<REED>, 1 <STONE>, 1 <GRAIN>, and 1 <VEGETABLE> in your supply, you get 1\u00a0bonus <SCORE>.'],
  cost: {},
  players: '1+',
})
