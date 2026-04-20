import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B89_Groom'

export const B89_Groom = new Occupation({
  id: CARD_ID,
  name: 'Groom',
  deck: 'B',
  number: 89,
  category: 'FARM_PLANNER',
  desc: [
    'When you play this card, immediately get 1 <WOOD>. Once you live in a stone house, at the start of each round, you can build exactly 1 stable for 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
})

export const B89_Groom_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => {
    return gainLeaf(CARD_ID, { wood: 1 })
  },
  onBeforeStartOfTurn: (_state, player) => {
    if (player.houseType !== 'stone') return
    if (player.resources.wood < 1) return

    // Optional: pay 1 wood, build 1 stable
    return {
      type: 'seq',
      optional: true,
      promptKey: 'log.cardEffect',
      children: [
        {
          type: 'leaf',
          actionId: 'pay-resources',
          params: { wood: 1 },
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: 'stables',
          params: { max: 1 },
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
