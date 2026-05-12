import { Occupation } from '../types'

const CARD_ID = 'B90_CooperativePlower'

export const B90_CooperativePlower = new Occupation({
  id: CARD_ID,
  name: 'Cooperative Plower',
  deck: 'B',
  number: 90,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ action space while the __Grain Seeds__ action space is occupied, you can plow 1 additional field.'],
  cost: {},
  players: '1+',
})
