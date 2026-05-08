import { Occupation } from '../types'

const CARD_ID = 'D142_PotatoPlanter'

export const D142_PotatoPlanter = new Occupation({
  id: CARD_ID,
  name: 'Potato Planter',
  deck: 'D',
  number: 142,
  category: 'CROP_PROVIDER',
  desc: ['At the end of each work phase in which you occupy the __Clay Pit__ or __Reed Bank__ accumulation space while the respective other is unoccupied, you get 1 <VEGETABLE>.'],
  cost: {},
  players: '3+',
  newSet: true,
})
