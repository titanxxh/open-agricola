import { Occupation } from '../types'

const CARD_ID = 'D164_PetGrower'

export const D164_PetGrower = new Occupation({
  id: CARD_ID,
  name: 'Pet Grower',
  deck: 'D',
  number: 164,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use an animal accumulation space, if afterward you have no animal in your house, you also get 1 <SHEEP>.'],
  cost: {},
  players: '4+',
})
