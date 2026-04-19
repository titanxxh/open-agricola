import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E96_Elder'

registerCardEffect({
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
})

export const E96_Elder = new Occupation({
  id: CARD_ID,
  name: 'Elder',
  deck: 'E',
  number: 96,
  category: 'ACTION_SPACE_EXTENDER',
  desc: ['You can play this card at the start of the work phase of round 1 without placing a person. (This card has no effect other than counting as a played occupation.)'],
  cost: {},
  players: '1+',
})
