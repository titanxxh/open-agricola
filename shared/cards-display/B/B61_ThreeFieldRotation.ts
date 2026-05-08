import { MinorImprovement } from '../types'

const CARD_ID = 'B61_ThreeFieldRotation'

export const B61_ThreeFieldRotation = new MinorImprovement({
  id: CARD_ID,
  name: 'Three-Field Rotation',
  deck: 'B',
  number: 61,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of the field phase of each harvest, if you have at least 1 <GRAIN> field, 1 <VEGETABLE> field, and 1 empty field, you get 3 <FOOD>.'],
  cost: {},
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
