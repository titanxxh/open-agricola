import { defineOccupationCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B127_Seducer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    if (state.round < 5) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { stone: 1, grain: 1, vegetable: 1, sheep: 1 } }),
        {
          type: 'leaf' as const,
          actionId: 'family-growth',
          sourceCard: CARD_ID,
          actionContext: { skipRoomCheck: true },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B127_Seducer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Seducer',
    deck: 'B',
    number: 127,
    category: 'FARM_PLANNER',
    desc: ['When you play this card in round 5 or later, you can immediately pay 1 <STONE>, 1 <GRAIN>, 1 <VEGETABLE>, and 1 <SHEEP> to take a __Family Growth Even without Room__ action.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B127_Seducer_impl = B127_Seducer.impl
