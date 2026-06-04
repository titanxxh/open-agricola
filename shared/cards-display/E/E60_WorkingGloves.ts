import { MinorImprovement } from '../types'

const CARD_ID = 'E60_WorkingGloves'

export const E60_WorkingGloves = new MinorImprovement({
  id: CARD_ID,
  name: 'Working Gloves',
  deck: 'E',
  number: 60,
  category: 'FOOD_-_CONVERT',
  desc: [
    'When you play this card, you get 1 <FOOD>. Each time you pay an occupation cost, you can pay 1 building resource of your choice in place of (up to) 2 <FOOD>.',
  ],
  cost: {},
})
