import { defineOccupationCard } from '../card-source'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D177_Graduate'
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      if ((player.resources.food ?? 0) < 1) return
      return payGainFlow({
        cardId: CARD_ID,
        cost: { food: 1 },
        gain: { stone: 2, reed: 2 },
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D177_Graduate = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Graduate',
    deck: 'D',
    number: 177,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['When you play this card you immediately pay 1 food. If you do, you get 2 stone and 2 reed.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D177_Graduate_impl = D177_Graduate.impl
