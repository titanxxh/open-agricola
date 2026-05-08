import { MinorImprovement } from '../types'

const CARD_ID = 'A24_ThreshingBoard'

export const A24_ThreshingBoard = new MinorImprovement({
  id: CARD_ID,
  name: 'Threshing Board',
  deck: 'A',
  number: 24,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you get an additional __Bake Bread__ action.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
