import { defineOccupationCard } from '../card-source'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B123_RoofBallaster'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const rooms = player.rooms
    if (rooms <= 0) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        gainLeaf(CARD_ID, { stone: rooms }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B123_RoofBallaster = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Roof Ballaster',
    deck: 'B',
    number: 123,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['When you play this card, you can immediately pay 1 <FOOD> to get 1 <STONE> for each room you have.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B123_RoofBallaster_impl = B123_RoofBallaster.impl
