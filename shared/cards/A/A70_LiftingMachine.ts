import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A70_LiftingMachine'
const harvestRounds = [4, 7, 9, 11, 13, 14]

registerCardEffect({
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (harvestRounds.includes(state.round)) return
    const vegFields = player.fields.filter(f => f.crop === 'vegetable' && f.remaining > 0)
    if (vegFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'field-select',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        fieldFilter: 'has-vegetable',
        maxSelections: 1,
        fieldEffect: 'take-vegetable',
      },
    }
  },
})

export const A70_LiftingMachine = new MinorImprovement({
  id: "A70_LiftingMachine",
  name: "Lifting Machine",
  deck: "A",
  number: 70,
  category: "CROP_PROVIDER",
  desc: ["At the end of each round that does not end with a harvest, you can move 1 <VEGETABLE> from one of your fields to your supply. (This is not considered a field phase.)"],
  cost: {"wood":1},
  prerequisite: "3 Fields",
})
