import { Occupation } from '../types'

const CARD_ID = 'A90_PlowDriver'

export const A90_PlowDriver = new Occupation({
  id: CARD_ID,
  name: 'Plow Driver',
  deck: 'A',
  number: 90,
  category: 'FARM_PLANNER',
  desc: ['Once you live in a stone house, at the start of each round, you can pay 1 <FOOD> to plow 1 field.'],
  cost: {},
  players: '1+',
})
