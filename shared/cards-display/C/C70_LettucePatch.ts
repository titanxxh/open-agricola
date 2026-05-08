import { MinorImprovement } from '../types'

const CARD_ID = 'C70_LettucePatch'

export const C70_LettucePatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Lettuce Patch',
  deck: 'C',
  number: 70,
  category: 'CROP_PROVIDER',
  providesField: true,
  vp: 1,
  cost: {},
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
  isField: true,
  desc: [
    'This card is a field that can only grow vegetables. You can immediately turn each <VEGETABLE> you harvested from this card into 4 <FOOD>.',
  ],
})
