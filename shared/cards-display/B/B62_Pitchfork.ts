import { MinorImprovement } from '../types'

const CARD_ID = 'B62_Pitchfork'

export const B62_Pitchfork = new MinorImprovement({
  id: CARD_ID,
  name: 'Pitchfork',
  deck: 'B',
  number: 62,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Grain Seeds__ action space, if the __Farmland__ action space is occupied you also get 3 <FOOD>.'],
  cost: { wood: 1 },
})
