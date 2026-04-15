import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C107_Baker'

/**
 * C107 Baker:
 * - onBuy: get a Bake Bread action.
 * - onStartHarvestFeedingPhase: get an optional Bake Bread action.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (player.resources.grain < 1) return
    return {
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
  onStartHarvestFeedingPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.resources.grain < 1) return
    return {
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
})

export const C107_Baker = new Occupation({
  id: CARD_ID,
  name: 'Baker',
  deck: 'C',
  number: 107,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you get a __Bake Bread__ action. At the start of each feeding phase, you get a __Bake Bread__ action.',
  ],
  cost: {},
  players: '1+',
})
