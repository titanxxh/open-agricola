import { defineMinorCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D018_SteamPlow'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    // Check player can afford the cost
    if ((player.resources.wood ?? 0) < 2 || (player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { wood: 2, food: 1 } }),
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D018_SteamPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Steam Plow',
    deck: 'D',
    number: 18,
    category: 'FARM_PLANNER',
    desc: ['Immediately after each returning home phase, you can pay 2 <WOOD> and 1 <FOOD> to use the __Farmland__ action space without placing a person.'],
    cost: { wood: 1, food: 1 },
    vp: 1,
  },
  impl: cardImpl,
})

export const D018_SteamPlow_impl = D018_SteamPlow.impl
