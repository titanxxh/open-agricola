import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C113_WinterCaretaker'

/**
 * C113 Winter Caretaker:
 * - onBuy: gain 1 grain.
 * - onEndHarvest: can buy 1 vegetable for 2 food (optional exchange).
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
  onEndHarvest: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.resources.food < 2) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 2 },
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesPaid: { food: 2 }, resourcesGained: { vegetable: 1 } },
        }),
        gainLeaf(CARD_ID, { vegetable: 1 }),
      ],
    }
  },
})

export const C113_WinterCaretaker = new Occupation({
  id: CARD_ID,
  name: 'Winter Caretaker',
  deck: 'C',
  number: 113,
  category: 'CROP_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <GRAIN>. At the end of each harvest, you can buy exactly 1 <VEGETABLE> for 2 <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
