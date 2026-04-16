import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C98_CubeCutter'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  onHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

export const C98_CubeCutter = new Occupation({
  id: CARD_ID,
  name: 'Cube Cutter',
  deck: 'C',
  number: 98,
  category: 'POINTS_PROVIDER',
  desc: ['When you play this card, you immediately get 1 <WOOD>. In the field phase of each harvest, you can use this card to exchange exactly 1 <WOOD> and 1 <FOOD> for 1 bonus <SCORE>.'],
  cost: {},
  players: '1+',
})
