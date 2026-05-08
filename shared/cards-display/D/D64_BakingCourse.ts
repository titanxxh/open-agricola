import { MinorImprovement } from '../types'

const CARD_ID = 'D64_BakingCourse'

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
  exchanges: [{ from: { grain: 1 }, to: { food: 2 }, triggers: ['bake-bread'] }],
  isBaking: true,
})
