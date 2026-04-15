import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C106_PotatoHarvester'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 3 }),
  onAfterReap: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    // Count vegetable fields that were harvested
    const vegFields = _state.harvestReapSummary?.[player.id]?.vegetableFields ?? 0
    if (vegFields <= 0) return
    return {
      type: 'seq',
      children: [gainLeaf(CARD_ID, { food: vegFields })],
    }
  },
})

export const C106_PotatoHarvester = new Occupation({
  id: CARD_ID,
  name: 'Potato Harvester',
  deck: 'C',
  number: 106,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 3 <FOOD>. For each <VEGETABLE> you get from your fields during the field phase of the harvest, you get 1 additional <FOOD>.',
  ],
  cost: {},
  players: '1+',
  implemented: true,
})
