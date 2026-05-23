import { MinorImprovement } from '../types'

const CARD_ID = 'B3_Moonshine'

export const B3_Moonshine = new MinorImprovement({
  id: CARD_ID,
  name: 'Moonshine',
  deck: 'B',
  number: 3,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Randomly select an occupation in your hand. Either play it for an occupation cost of 2 <FOOD>, or give it to the next player.',
  ],
  cost: {},
  passing: true,
})
