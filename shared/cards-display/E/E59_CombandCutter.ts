import { MinorImprovement } from '../types'

const CARD_ID = 'E59_CombandCutter'

export const E59_CombandCutter = new MinorImprovement({
  id: CARD_ID,
  name: 'Comb and Cutter',
  deck: 'E',
  number: 59,
  category: 'FOOD',
  desc: ['Each time you use the __Day Laborer__ action space, you get 1 additional <FOOD> for each <SHEEP> on the __Sheep Market__ accumulation space, up to a maximum of 4 additional <FOOD>.'],
  cost: { wood: 1 },
})
