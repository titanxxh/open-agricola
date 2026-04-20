import { Occupation } from '../types'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B123_RoofBallaster'

export const B123_RoofBallaster = new Occupation({
  id: CARD_ID,
  name: 'Roof Ballaster',
  deck: 'B',
  number: 123,
  category: 'RESOURCE_STONE',
  desc: ['When you play this card, you can immediately pay 1 <FOOD> to get 1 <STONE> for each room you have.'],
  cost: {},
  players: '1+',
})

export const B123_RoofBallaster_impl = {
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
