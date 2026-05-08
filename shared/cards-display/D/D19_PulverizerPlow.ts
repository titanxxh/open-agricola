import { MinorImprovement } from '../types'

const CARD_ID = 'D19_PulverizerPlow'

export const D19_PulverizerPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Pulverizer Plow',
  deck: 'D',
  number: 19,
  category: 'FARM_PLANNER',
  desc: [
    'Immediately after each time you use a clay accumulation space, you can pay 1 <CLAY> to plow 1 field. If you do, place that 1 <CLAY> on the accumulation space.',
  ],
  cost: { wood: 2 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
