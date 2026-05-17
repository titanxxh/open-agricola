import { MinorImprovement } from '../types'

const CARD_ID = 'E69_MelonPatch'

export const E69_MelonPatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Melon Patch',
  deck: 'E',
  number: 69,
  category: 'CROPS_-_VEGETABLE',
  desc: [
    'This card is a field that can only grow vegetables. Each time you harvest the last <VEGETABLE> from this card, you can plow 1 field.',
  ],
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  isField: true,
  cardField: { allowedCrops: ['vegetable'], capacity: 1 },
})
