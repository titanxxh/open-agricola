import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E37_OxSkull'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.resources.cattle === 0 ? 3 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E37_OxSkull = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Ox Skull",
    deck: "E",
    number: 37,
    category: "BONUS_POINTS_-_GET",
    desc: ['During scoring, if you have no <CATTLE>, you get 3 bonus <SCORE>.'],
    cost: {},
    prerequisite: '1 cattle',
    vp: 0,
    extraVp: true,
  },
  impl: cardImpl,
})

export const E37_OxSkull_impl = E37_OxSkull.impl
