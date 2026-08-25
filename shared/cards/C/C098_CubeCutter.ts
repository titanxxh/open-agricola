import { defineOccupationCard } from '../card-source'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C098_CubeCutter'

const cardImpl = {
  effect: {
  id: CARD_ID,
  preHarvestGoodsWanted: ['wood'],
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  onHarvestFieldPhase: (_state, player) => {
    if (player.resources.wood < 1 || player.resources.food < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { wood: 1, food: 1 } }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C098_CubeCutter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Cube Cutter',
    deck: 'C',
    number: 98,
    category: 'POINTS_PROVIDER',
    desc: ['When you play this card, you immediately get 1 <WOOD>. In the field phase of each harvest, you can use this card to exchange exactly 1 <WOOD> and 1 <FOOD> for 1 bonus <SCORE>.'],
    cost: {},
    players: '1+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const C098_CubeCutter_impl = C098_CubeCutter.impl
