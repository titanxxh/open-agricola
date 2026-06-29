import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D085_Reader'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: (player) => {
    return player.occupationPlayed.length >= 6 ? 1 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D085_Reader = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Reader',
    deck: 'D',
    number: 85,
    category: 'FARM_PLANNER',
    desc: [
        'As soon as you have 6 (__7 in draft mode__) occupations in front of you (including this one), this card provides room for one person.',
      ],
    cost: {},
    players: '1+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D085_Reader_impl = D085_Reader.impl
