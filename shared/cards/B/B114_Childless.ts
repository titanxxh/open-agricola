import { defineOccupationCard } from '../card-source'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'B114_Childless'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    if (roomCount < 3) return
    if (familySize(player) !== 2) return
    return {
      type: 'xor',
      children: [
        {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1, grain: 1 },
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1, vegetable: 1 },
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B114_Childless = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Childless',
    deck: 'B',
    number: 114,
    category: 'CROP_PROVIDER',
    desc: ['At the start of each round, if you have at least 3 rooms but only 2 people, you get 1 <FOOD> and 1 crop of your choice (<GRAIN> or <VEGETABLE>)'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B114_Childless_impl = B114_Childless.impl
