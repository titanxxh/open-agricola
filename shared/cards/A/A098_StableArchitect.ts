import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getUnfencedStableCountForCards } from '../../domain/stables'

const CARD_ID = 'A098_StableArchitect'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => getUnfencedStableCountForCards(player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A098_StableArchitect = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Stable Architect",
    deck: "A",
    number: 98,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each unfenced <STABLE> in your farmyard."],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A098_StableArchitect_impl = A098_StableArchitect.impl
