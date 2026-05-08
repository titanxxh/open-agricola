import { Occupation } from '../types'

const CARD_ID = 'E137_FlaxFarmer'

export const E137_FlaxFarmer = new Occupation({
  id: CARD_ID,
  name: 'Flax Farmer',
  deck: 'E',
  number: 137,
  category: 'GOODS_-_GET',
  desc: ['Each time you use the __Reed Bank__ accumulation space, you also get 1\u00a0<GRAIN>. Each time you use the __Grain Seeds__ action space, you also get 1 <REED>.'],
  cost: {},
  players: '3+',
})
