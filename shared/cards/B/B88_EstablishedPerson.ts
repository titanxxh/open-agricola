import { Occupation } from '../types'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B88_EstablishedPerson'

export const B88_EstablishedPerson = new Occupation({
  id: CARD_ID,
  name: 'Established Person',
  deck: 'B',
  number: 88,
  category: 'FARM_PLANNER',
  desc: ['If your house has exactly 2 rooms, immediately renovate it without paying any building resources. If you do, you can immediately afterward take a __Build Fences__ action.'],
  cost: {},
  players: '1+',
})

export const B88_EstablishedPerson_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (player.rooms !== 2 || player.houseType === 'stone') return
    return {
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'renovation',
          sourceCard: CARD_ID,
        },
        {
          type: 'seq' as const,
          optional: true,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
            {
              type: 'leaf' as const,
              actionId: 'fencing',
              sourceCard: CARD_ID,
            },
          ],
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
