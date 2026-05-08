import { MinorImprovement } from '../types'

const CARD_ID = 'E23_Apiary'

export const E23_Apiary = new MinorImprovement({
  id: CARD_ID,
  name: 'Apiary',
  deck: 'E',
  number: 23,
  category: 'ACTION',
  desc: ['At the end of each work phase, you can sow exactly 1 crop on 1 field.'],
  cost: {},
  prerequisite: '4 Occupations',
  occupationPrerequisites: { min: 4 },
  evenMoreSet: true,
})
