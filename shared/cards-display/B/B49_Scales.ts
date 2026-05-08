import { MinorImprovement } from '../types'

const CARD_ID = 'B49_Scales'

export const B49_Scales = new MinorImprovement({
  id: CARD_ID,
  name: 'Scales',
  deck: 'B',
  number: 49,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time after you place an improvement or occupation in front of you, if you then have the same number of improvements and occupations in play, you get 2 <FOOD>.',
  ],
  cost: { wood: 1 },
  prerequisite: 'No Occupation',
  occupationPrerequisites: { max: 0 },
  newSet: true,
})
