import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farmyard-usage'

const CARD_ID = 'E034_LandRegister'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return hasNoUnusedFarmyardSpaces(player) ? 2 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E034_LandRegister = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Land Register",
    deck: "E",
    number: 34,
    category: "BONUS_POINTS_-_GET",
    desc: ['During scoring, if your farm has no unused spaces, you get 2 bonus <SCORE>.'],
    cost: { wood: 1 },
    vp: 0,
    extraVp: true,
  },
  impl: cardImpl,
})

export const E034_LandRegister_impl = E034_LandRegister.impl
