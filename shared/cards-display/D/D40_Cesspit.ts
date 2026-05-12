import { MinorImprovement } from '../types'

const CARD_ID = 'D40_Cesspit'

export const D40_Cesspit = new MinorImprovement({
  id: CARD_ID,
  name: 'Cesspit',
  deck: 'D',
  number: 40,
  category: 'GOODS_PROVIDER',
  desc: ['Alternate placing 1 <CLAY> and 1 <PIG> on each remaining round space, starting with <CLAY>. At the start of these rounds, you get the respective good.'],
  cost: {},
  vp: -1,
  prerequisite: '2 Fields and 1 Occupation',
  occupationPrerequisites: { min: 1 },
})
