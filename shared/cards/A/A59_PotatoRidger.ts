import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A59_PotatoRidger'

registerCardEffect({
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    // Only trigger if at least 1 vegetable was harvested
    const vegHarvested = _state.harvestReapSummary?.[player.id]?.vegetableFields ?? 0
    if (vegHarvested <= 0) return
    if (player.resources.vegetable < 3) return
    const mandatory = player.resources.vegetable >= 4
    return {
      type: 'seq',
      optional: !mandatory,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { vegetable: 1 } }),
        gainLeaf(CARD_ID, { food: 6 }),
      ],
    }
  },
})

export const A59_PotatoRidger = new MinorImprovement({
  id: CARD_ID,
  name: 'Potato Ridger',
  deck: 'A',
  number: 59,
  category: 'FOOD_PROVIDER',
  desc: ['Each time after you harvest 1+ <VEGETABLE>, if you then have 3+ <VEGETABLE> in your supply, you can turn exactly 1 <VEGETABLE> into 6 <FOOD>. With 4+ <VEGETABLE>, you must do so.'],
  cost: { wood: 1 },
})
