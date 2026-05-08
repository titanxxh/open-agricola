import { Occupation } from '../types'

const CARD_ID = 'A120_ClayHutBuilder'

export const A120_ClayHutBuilder = new Occupation({
  id: CARD_ID,
  name: 'Clay Hut Builder',
  deck: 'A',
  number: 120,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Once you no longer live in a wooden house, place 2 <CLAY> on each of the next 5 round spaces. At the start of these rounds, you get the <CLAY>.',
  ],
  cost: {},
  players: '1+',
})
