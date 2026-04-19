import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldTotalRemaining } from '../../game/field'

const CARD_ID = 'A64_BarleyMill'

registerCardEffect({
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    const grainFields = _state.harvestReapSummary?.[player.id]?.grainFields
      ?? player.fields.filter((field) => {
        const legacyAmount = (field as unknown as { amount?: number }).amount ?? 0
        return fieldHasCrop(field, 'grain') && (fieldTotalRemaining(field) > 0 || legacyAmount > 0)
      }).length
    if (grainFields <= 0) return
    return {
      type: 'seq',
      children: [gainLeaf(CARD_ID, { food: grainFields })],
    }
  },
})

export const A64_BarleyMill = new MinorImprovement({
  id: CARD_ID,
  name: "Barley Mill",
  deck: "A",
  number: 64,
  category: "FOOD_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <FOOD> for each grain field that you harvest."],
  vp: 1,
  cost: { wood: 1 },
  altCosts: [{ clay: 4 }, { stone: 2 }],
})
