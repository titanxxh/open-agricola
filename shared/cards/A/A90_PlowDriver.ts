import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A90_PlowDriver'

// A90 Plow Driver: Once you live in a stone house, at the start of each round,
// you can pay 1 food to plow 1 field.
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

export const A90_PlowDriver = new Occupation({
  id: CARD_ID,
  name: 'Plow Driver',
  deck: 'A',
  number: 90,
  category: 'FARM_PLANNER',
  desc: ['Once you live in a stone house, at the start of each round, you can pay 1 <FOOD> to plow 1 field.'],
  cost: {},
  players: '1+',
})
