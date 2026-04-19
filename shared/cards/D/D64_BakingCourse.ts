import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D64_BakingCourse'
const harvestRounds = [4, 7, 9, 11, 13, 14]

registerCardEffect({
  id: CARD_ID,
  onAfterRoundEnd: (state, player) => {
    if (harvestRounds.includes(state.round)) return
    if (player.resources.grain < 1) return

    return {
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
})

export const D64_BakingCourse = new MinorImprovement({
  id: CARD_ID,
  name: "Baking Course",
  deck: "D",
  number: 64,
  category: "FOOD_PROVIDER",
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
    'At the end of each round that does not end with a harvest, you can take a __Bake Bread__ action.',
  ],
  cost: {},
  prerequisite: "1 Occupation",
  occupationPrerequisites: { min: 1 },
  exchanges: [{ from: { grain: 1 }, to: { food: 2 }, trigger: 'bake-bread' }],
  isBaking: true,
})
