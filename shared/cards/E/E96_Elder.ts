import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E96_Elder'

export const E96_Elder = new Occupation({
  id: CARD_ID,
  name: 'Elder',
  deck: 'E',
  number: 96,
  category: 'ACTION_-_IMPROVEMENT',
  desc: ['You can play this card at the start of the work phase of round 1 without placing a person. (This card has no effect other than counting as a played occupation.)'],
  cost: {},
  players: '1+',
})

export const E96_Elder_impl = {
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
          actionId: 'play-occupation',
          sourceCard: CARD_ID,
          params: { costOverride: {}, allowedCards: [CARD_ID] },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
