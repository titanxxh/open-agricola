import { MinorImprovement } from '../types'

const CARD_ID = 'C20_MolePlow'

export const C20_MolePlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Mole Plow',
  deck: 'C',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you can plow 1 additional field.'],
  cost: { wood: 3, food: 1 },
  prerequisite: 'Play in Round 9 or Later',
})
