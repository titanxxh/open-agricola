import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E96_Elder'

const cardImpl = {
  effect: {
  id: CARD_ID,
  handHooks: ['onBeforeStartOfTurn'],
  onBeforeStartOfTurn: (state, _player) => {
    if (state.round !== 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'occupation',
          sourceCard: CARD_ID,
          params: { exactCost: {}, allowedCards: [CARD_ID] },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E96_Elder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Elder',
    deck: 'E',
    number: 96,
    category: 'ACTION_-_IMPROVEMENT',
    desc: ['You can play this card at the start of the work phase of round 1 without placing a person. (This card has no effect other than counting as a played occupation.)'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E96_Elder_impl = E96_Elder.impl
