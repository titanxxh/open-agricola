import { Occupation } from '../types'

const CARD_ID = 'D90_PlowMaker'

export const D90_PlowMaker = new Occupation({
  id: CARD_ID,
  name: 'Plow Maker',
  deck: 'D',
  number: 90,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you can pay 1 <FOOD> to plow 1 additional field.'],
  cost: {},
  players: '1+',
})
