import { Occupation } from '../types'

const CARD_ID = 'D138_PetLover'

export const D138_PetLover = new Occupation({
  id: CARD_ID,
  name: 'Pet Lover',
  deck: 'D',
  number: 138,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use an accumulation space providing exactly 1 animal, you can leave it on the space and get one from the general supply instead, as well as 3 <FOOD> and 1 <GRAIN>.'],
  cost: {},
  players: '3+',
})
