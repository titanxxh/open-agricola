import { MinorImprovement } from '../types'

const CARD_ID = 'A54_Credit'

export const A54_Credit = new MinorImprovement({
  id: CARD_ID,
  name: 'Credit',
  deck: 'A',
  number: 54,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 5 <FOOD>. At the end of each round that does not end with a harvest, you must pay 1 <FOOD>, or else take a <BEGGING> marker.',
  ],
  prerequisite: 'At Most 3 Occupations',
  occupationPrerequisites: { max: 3 },
  newSet: true,
})
