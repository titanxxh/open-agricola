import { defineMinorCard } from '../card-source'
import { getPalisadeCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'B030_WoodPalisades'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return getPalisadeCount(player)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B030_WoodPalisades = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wood Palisades',
    deck: 'B',
    number: 30,
    category: 'POINTS_PROVIDER',
    desc: ['Instead of a <FENCE> piece, you can place 2 <WOOD> from your supply on the <FENCE> spaces at the edge of your farmyard. These <FENCE> spaces with 2 <WOOD> are each worth 1 <SCORE>.'],
    cost: { food: 1 },
    vp: 0,
    enablesPalisades: true,
    extraVp: true,
  },
  impl: cardImpl,
})

export const B030_WoodPalisades_impl = B030_WoodPalisades.impl
