import { defineOccupationCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A090_PlowDriver'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return
    if ((player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A090_PlowDriver = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plow Driver',
    deck: 'A',
    number: 90,
    category: 'FARM_PLANNER',
    desc: ['Once you live in a stone house, at the start of each round, you can pay 1 <FOOD> to plow 1 <FIELD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A090_PlowDriver_impl = A090_PlowDriver.impl
