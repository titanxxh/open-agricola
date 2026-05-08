import { Occupation } from '../types'

const CARD_ID = 'D123_RenovationPreparer'

export const D123_RenovationPreparer = new Occupation({
  id: CARD_ID,
  name: 'Renovation Preparer',
  deck: 'D',
  number: 123,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['For each new wood/clay room you build, you get 2 <CLAY>/2 <STONE>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
