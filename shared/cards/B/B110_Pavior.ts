import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B110_Pavior'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (player.resources.stone < 1) return
    const resource = state.round === 14 ? 'vegetable' : 'food'
    return gainLeaf(CARD_ID, { [resource]: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B110_Pavior = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pavior',
    deck: 'B',
    number: 110,
    category: 'FOOD_PROVIDER',
    desc: [
        'At the end of each preparation phase, if you have at least 1 <STONE> in your supply, you get 1 <FOOD>. In round 14, you get 1 <VEGETABLE> instead.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B110_Pavior_impl = B110_Pavior.impl
