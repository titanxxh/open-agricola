import { MinorImprovement } from '../types'

const CARD_ID = 'B63_Tasting'

export const B63_Tasting = new MinorImprovement({
  id: CARD_ID,
  name: 'Tasting',
  deck: 'B',
  number: 63,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use a __Lessons__ action space, before paying the occupation cost, you can exchange 1 <GRAIN> for 4 <FOOD>.',
  ],
  cost: { wood: 2 },
  vp: 1,
})
