import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A64_BarleyMill'

registerCardEffect({
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const grainFields = _state.harvestReapSummary?.[player.id]?.grainFields
      ?? player.fields.filter((field) => {
        const legacyAmount = (field as unknown as { amount?: number }).amount ?? 0
        return field.crop === 'grain' && (field.remaining > 0 || legacyAmount > 0)
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
  cost: {},
})
