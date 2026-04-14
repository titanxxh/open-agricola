import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D82_HuntingTrophy'

/**
 * D82 Hunting Trophy (MinorImprovement, D, 82)
 * Costs 1 boar to play (pay with boar). On buy, gain 3 food.
 * Also has a cooking exchange: 1 boar → 4 food (anytime).
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 3 }),
})

export const D82_HuntingTrophy = new MinorImprovement({
  id: CARD_ID,
  name: 'Hunting Trophy',
  deck: 'D',
  number: 82,
  category: 'FOOD_PROVIDER',
  desc: ['When you play this card (costs 1 <BOAR>), you immediately get 3 <FOOD>. You can also convert <BOAR> to <FOOD> at a rate of 1:4 at any time.'],
  cost: { boar: 1 },
  vp: 1,
  exchanges: [{ from: { boar: 1 }, to: { food: 4 }, trigger: 'anytime' }],
})
