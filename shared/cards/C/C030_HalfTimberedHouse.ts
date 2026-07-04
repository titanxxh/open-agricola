import { defineMinorCard } from '../card-source'
import { getStoneHouseBonusScore } from '../helpers/stone-house-bonus'
import type { CardImpl } from '../registry'

const CARD_ID = 'C030_HalfTimberedHouse'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return getStoneHouseBonusScore(player, CARD_ID)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C030_HalfTimberedHouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Half-Timbered House",
    deck: "C",
    number: 30,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each stone room you have. You can only use one card to get bonus <SCORE> for your stone house."],
    cost: { wood: 1, clay: 1, stone: 2, reed: 1 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const C030_HalfTimberedHouse_impl = C030_HalfTimberedHouse.impl
