import { MinorImprovement } from '../types'

const CARD_ID = 'C46_Mandoline'

export const C46_Mandoline = new MinorImprovement({
  id: CARD_ID,
  name: 'Mandoline',
  deck: 'C',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can pay 1 <VEGETABLE> to get 1 bonus <SCORE>. If you do, place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  extraVp: true,
})
