import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E4_Thunderbolt'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const grainFields = player.fields.filter(f => f.crop === 'grain' && f.remaining > 0)
    if (grainFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'field-select',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        fieldFilter: 'has-grain',
        maxSelections: 1,
        fieldEffect: 'remove-all-grain-for-wood',
      },
    }
  },
})

export const E4_Thunderbolt = new MinorImprovement({
  id: "E4_Thunderbolt",
  name: "Thunderbolt",
  deck: "E",
  number: 4,
  desc: ["Immediately remove all <GRAIN> from one of your fields to the general supply. Gain 2 <WOOD> for each <GRAIN> you just removed."],
  cost: {},
  prerequisite: "1 Grain Field",
  passing: true,
})
