import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D097_BeggingStudent'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    player.resources.begging += 1
  },
  onStartHarvest: (_state, player) => {
    if (player.occupationHand.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'occupation',
          sourceCard: CARD_ID,
          params: { exactCost: {} },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D097_BeggingStudent = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Begging Student',
    deck: 'D',
    number: 97,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'When you play this card, you must immediately take 1 <BEGGING> marker. At the start of each harvest, you can play 1 occupation without paying an occupation cost.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D097_BeggingStudent_impl = D097_BeggingStudent.impl
