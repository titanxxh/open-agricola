import { MinorImprovement } from '../types'

const CARD_ID = 'E72_ArtichokeField'

export const E72_ArtichokeField = new MinorImprovement({
  id: CARD_ID,
  name: 'Artichoke Field',
  deck: 'E',
  number: 72,
  category: 'CROPS_-_GRAIN_AND_VEGETABLE',
  desc: [
    'This card is a field. During the field phase of each harvest, if you harvest at least 1\u00a0good from this card, you also get 1 <FOOD>.',
  ],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  isField: true,
  cardField: { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
})
