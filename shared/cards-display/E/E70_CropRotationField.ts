import { MinorImprovement } from '../types'

const CARD_ID = 'E70_CropRotationField'

export const E70_CropRotationField = new MinorImprovement({
  id: CARD_ID,
  name: 'Crop Rotation Field',
  deck: 'E',
  number: 70,
  category: 'CROPS_-_VEGETABLE',
  desc: [
    'This card is a field. Each time you remove the last <GRAIN> or <VEGETABLE> from this card, you can immediately sow <VEGETABLE> or <GRAIN> on this card, respectively.',
  ],
  cost: {},
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  isField: true,
})
