import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E152_BargainHunter'

// E152 Bargain Hunter: At the start of each round, you can place 1 food from your supply
// on the Traveling Players accumulation space to play a minor improvement by paying its cost.
// Simplified: pay 1 food and play a minor improvement (the food placement on Traveling Players
// space is a cosmetic effect that adds to the accumulation; we approximate with a pay action).
registerCardEffect({
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
          actionId: 'minor-improvement',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false },
        },
      ],
    }
  },
})

export const E152_BargainHunter = new Occupation({
  id: CARD_ID,
  name: 'Bargain Hunter',
  deck: 'E',
  number: 152,
  category: 'ACTION_IMPROVEMENTS_OR_OCCUPATIONS',
  desc: ['At the start of each round, you can place 1 <FOOD> from your supply on the __Traveling Players__ accumulation space to play a minor improvement by paying its cost.'],
  cost: {},
  players: '4+',
})
