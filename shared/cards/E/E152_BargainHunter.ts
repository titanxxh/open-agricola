import { defineOccupationCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E152_BargainHunter'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if ((player.resources.food ?? 0) < 1) return
    if (player.minorHand.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
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

export const E152_BargainHunter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Bargain Hunter',
    deck: 'E',
    number: 152,
    category: 'ACTION_-_IMPROVEMENTS_OR_OCCUPATIONS',
    desc: ['At the start of each round, you can place 1 <FOOD> from your supply on the __Traveling Players__ accumulation space to play a minor improvement by paying its cost.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E152_BargainHunter_impl = E152_BargainHunter.impl
