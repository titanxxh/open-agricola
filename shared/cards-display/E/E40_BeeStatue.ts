import { MinorImprovement } from '../types'

const CARD_ID = 'E40_BeeStatue'

export const E40_BeeStatue = new MinorImprovement({
  id: CARD_ID,
  name: 'Bee Statue',
  deck: 'E',
  number: 40,
  category: 'GOODS_-_GET',
  desc: ['Pile (from bottom to top) 1 <VEGETABLE>, 1 <STONE>, 1 <GRAIN>, 1 <STONE>, 1 <GRAIN> on this card. Each time you use the __Day Laborer__ action space, you get the top good.'],
  cost: { clay: 2 },
  players: '1+',
})
