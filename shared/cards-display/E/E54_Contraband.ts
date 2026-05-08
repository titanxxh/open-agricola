import { MinorImprovement } from '../types'

const CARD_ID = 'E54_Contraband'

export const E54_Contraband = new MinorImprovement({
  id: CARD_ID,
  name: 'Contraband',
  deck: 'E',
  number: 54,
  category: 'FOOD',
  desc: [
    'Each time you play or build an improvement after this, you can pay 1 additional building resource of a type in the printed cost to get 3 <FOOD>.',
  ],
  cost: { food: 1 },
})
