import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'B097_Scholar'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return
    return {
      type: 'xor',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'occupation',
          sourceCard: CARD_ID,
          params: { exactCost: { food: 1 } },
        },
        {
          type: 'leaf',
          actionId: 'improvement',
          sourceCard: CARD_ID,
          actionContext: { types: ['minor'], trueAction: false },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B097_Scholar = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Scholar',
    deck: 'B',
    number: 97,
    category: 'ACTIONS_BOOSTER',
    desc: ['Once you live in a stone house, at the start of each round, you can play an occupation for an occupation cost of 1 <FOOD>, or a minor improvement (by paying its cost).'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B097_Scholar_impl = B097_Scholar.impl
