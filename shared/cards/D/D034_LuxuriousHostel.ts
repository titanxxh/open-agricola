import { defineMinorCard } from '../card-source'
import { getStoneHouseBonusScore } from '../helpers/stone-house-bonus'
import type { CardImpl } from '../registry'

const CARD_ID = 'D034_LuxuriousHostel'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return getStoneHouseBonusScore(player, CARD_ID)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D034_LuxuriousHostel = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Luxurious Hostel",
    deck: "D",
    number: 34,
    category: "POINTS_PROVIDER",
    desc: [
        'During scoring, if you then have more stone rooms than people, you get 4 bonus <SCORE>. You can only use one card to get bonus <SCORE> for your stone house.',
      ],
    cost: { wood: 1, clay: 2 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const D034_LuxuriousHostel_impl = D034_LuxuriousHostel.impl
