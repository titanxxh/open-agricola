import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E100_MuseumCaretaker'

const cardImpl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E100_MuseumCaretaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Museum Caretaker',
    deck: 'E',
    number: 100,
    category: 'BONUS_POINTS_-_GET',
    desc: ['At the start of each work phase, if you have at least 1 <WOOD>, 1 <CLAY>, 1\u00a0<REED>, 1 <STONE>, 1 <GRAIN>, and 1 <VEGETABLE> in your supply, you get 1\u00a0bonus <SCORE>.'],
    cost: {},
    players: '1+',
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const E100_MuseumCaretaker_impl = E100_MuseumCaretaker.impl
