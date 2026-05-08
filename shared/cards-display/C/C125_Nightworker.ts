import { Occupation } from '../types'

const CARD_ID = 'C125_Nightworker'

export const C125_Nightworker = new Occupation({
  id: CARD_ID,
  name: 'Nightworker',
  deck: 'C',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Before the start of each work phase, you can place a person on an accumulation space of a building resource not in your supply. (Then proceed with the start player.)'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
