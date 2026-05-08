import { MinorImprovement } from '../types'

const CARD_ID = 'D17_DrillHarrow'

export const D17_DrillHarrow = new MinorImprovement({
  id: CARD_ID,
  name: 'Drill Harrow',
  deck: 'D',
  number: 17,
  category: 'FARM_PLANNER',
  desc: ['Each time before you take an unconditional __Sow__ action, you can pay 3 <FOOD> to plow 1 field.'],
  cost: { wood: 1 },
  evenMoreSet: true,
})
