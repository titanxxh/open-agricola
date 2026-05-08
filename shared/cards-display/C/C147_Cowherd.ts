import { Occupation } from '../types'

const CARD_ID = 'C147_Cowherd'

export const C147_Cowherd = new Occupation({
  id: CARD_ID,
  name: 'Cowherd',
  deck: 'C',
  number: 147,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Cattle Market__ accumulation space, you get 1 additional <CATTLE>.'],
  cost: {},
  players: '3+',
})
