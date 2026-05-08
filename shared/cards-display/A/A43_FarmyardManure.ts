import { MinorImprovement } from '../types'

const CARD_ID = 'A43_FarmyardManure'

export const A43_FarmyardManure = new MinorImprovement({
  id: CARD_ID,
  name: 'Farmyard Manure',
  deck: 'A',
  number: 43,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you build 1 or more stables in one turn, you place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  prerequisite: '1 Animal',
  evenMoreSet: true,
})
