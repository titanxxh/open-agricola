import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B089_Groom'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => {
    return gainLeaf(CARD_ID, { wood: 1 })
  },
  onBeforeStartOfTurn: (_state, player) => {
    if (player.houseType !== 'stone') return
    return {
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        max: 1,
        exactCost: { wood: 1, max: 1 },
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B089_Groom = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Groom',
    deck: 'B',
    number: 89,
    category: 'FARM_PLANNER',
    desc: [
        'When you play this card, immediately get 1 <WOOD>. Once you live in a stone house, at the start of each round, you can build exactly 1 <STABLE> for 1 <WOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B089_Groom_impl = B089_Groom.impl
