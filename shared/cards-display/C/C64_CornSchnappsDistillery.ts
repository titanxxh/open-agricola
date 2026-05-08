import { MinorImprovement } from '../types'

const CARD_ID = 'C64_CornSchnappsDistillery'

export const C64_CornSchnappsDistillery = new MinorImprovement({
  id: CARD_ID,
  name: 'Corn Schnapps Distillery',
  deck: 'C',
  number: 64,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can pay 1 <GRAIN> to place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1, clay: 2 },
  vp: 1,
})
